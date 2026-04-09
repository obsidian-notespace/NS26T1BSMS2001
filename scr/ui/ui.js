// script.js – Core logic for rendering questions and handling interactions
(function () {
    // Wait for DOM content to be fully loaded
    document.addEventListener('DOMContentLoaded', function () {
        const container = document.getElementById('questions-container');
        if (!container) {
            console.error("Container #questions-container not found.");
            return;
        }
        if (typeof window.questionsData === 'undefined') {
            console.error("window.questionsData is not defined. Please define it before loading this script.");
            return;
        }

        // Helper to escape HTML
        function escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function sanitizeMediaUrl(url) {
            const value = String(url || '').trim();
            if (!value) return '';
            if (/^(https?:)?\/\//i.test(value)) return value;
            if (/^(\/|\.\.?\/)/.test(value)) return value;
            return '';
        }

        function normalizeLanguage(languageHint) {
            const hint = String(languageHint || '').trim().toLowerCase();
            if (!hint) return '';
            const map = {
                js: 'javascript',
                ts: 'typescript',
                py: 'python',
                cplusplus: 'cpp',
                'c++': 'cpp',
                cxx: 'cpp',
                cc: 'cpp',
                c: 'c',
                cs: 'csharp',
                'c#': 'csharp',
                sh: 'bash',
                shell: 'bash',
                zsh: 'bash',
                yml: 'yaml',
                md: 'markdown',
                htm: 'html'
            };
            return map[hint] || hint.replace(/[^a-z0-9_+-]/g, '');
        }

        function renderCodeBlock(code, languageHint) {
            const language = normalizeLanguage(languageHint);
            const languageClass = language ? `language-${language}` : '';
            return `
                <pre class="question-code-block"><code class="${languageClass}">${escapeHtml(code)}</code></pre>
            `;
        }

        function ensureHighlightJsAssets() {
            if (window.hljs) return Promise.resolve();
            if (window.__hljsLoadingPromise) return window.__hljsLoadingPromise;

            function injectCssOnce(id, href) {
                if (document.getElementById(id)) return;
                const link = document.createElement('link');
                link.id = id;
                link.rel = 'stylesheet';
                link.href = href;
                document.head.appendChild(link);
            }

            function injectScriptOnce(id, src) {
                return new Promise((resolve, reject) => {
                    if (document.getElementById(id)) {
                        resolve();
                        return;
                    }
                    const script = document.createElement('script');
                    script.id = id;
                    script.src = src;
                    script.async = false;
                    script.onload = () => resolve();
                    script.onerror = () => reject(new Error(`Failed to load ${src}`));
                    document.head.appendChild(script);
                });
            }

            injectCssOnce(
                'hljs-theme-github',
                'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github.min.css'
            );

            window.__hljsLoadingPromise = injectScriptOnce(
                'hljs-core',
                'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js'
            )
                .then(() => injectScriptOnce(
                    'hljs-lang-cpp',
                    'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/cpp.min.js'
                ))
                .then(() => injectScriptOnce(
                    'hljs-lang-python',
                    'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/python.min.js'
                ))
                .then(() => injectScriptOnce(
                    'hljs-lang-sql',
                    'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/sql.min.js'
                ))
                .catch((error) => {
                    console.warn('Highlight.js assets could not be fully loaded.', error);
                });

            return window.__hljsLoadingPromise;
        }

        function applySyntaxHighlighting(rootElement) {
            if (!window.hljs) return;
            const scope = rootElement || document;
            const codeBlocks = scope.querySelectorAll('pre code');
            codeBlocks.forEach((block) => {
                if (block.dataset.hljsDone === '1') return;

                const hasLanguage = /(^|\s)language-[a-z0-9_+-]+(\s|$)/i.test(block.className);
                if (hasLanguage) {
                    window.hljs.highlightElement(block);
                } else {
                    const source = block.textContent || '';
                    const result = window.hljs.highlightAuto(source);
                    block.innerHTML = result.value;
                    block.classList.add('hljs');
                    if (result.language) {
                        block.classList.add(`language-${result.language}`);
                    }
                }

                block.dataset.hljsDone = '1';
            });
        }

        function renderMath(rootElement) {
            if (typeof window.renderMathInElement !== 'function') return;
            const scope = rootElement || document.body;

            if (scope && scope.nodeType === 1 && scope.dataset.katexRendered === '1') {
                return;
            }

            window.renderMathInElement(scope, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ],
                output: 'html',
                processEscapes: true,
                ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
                throwOnError: false,
                strict: 'ignore'
            });

            if (scope && scope.nodeType === 1) {
                scope.dataset.katexRendered = '1';
            }
        }

        function normalizeMathSegment(segment) {
            if (!segment) return segment;
            let out = String(segment);

            // Recover LaTeX commands corrupted by JS escapes in plain strings.
            // Examples: "\begin" -> "\u0008egin", "\frac" -> "\u000Crac", "\theta" -> "\u0009heta".
            out = out
                .replace(/\u0008/g, '\\b')
                .replace(/\u0009/g, '\\t')
                .replace(/\u000A/g, '\\n')
                .replace(/\u000B/g, '\\v')
                .replace(/\u000C/g, '\\f')
                .replace(/\u000D/g, '\\r');

            // Recover matrix row separators that were written as "\\" in JS source,
            // which become a single backslash at runtime.
            if (/\\begin\{[a-z*]+\}/i.test(out)) {
                out = out.replace(/\\\s+/g, '\\\\ ');
            }

            const commands = [
                'begin', 'end', 'mathbf', 'mathbb', 'mathcal', 'operatorname',
                'overline', 'bar', 'frac', 'sqrt', 'cdot', 'sum', 'prod', 'det', 'arg', 'diag',
                'langle', 'rangle', 'alpha', 'beta',
                'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu', 'pi',
                'sigma', 'phi', 'psi', 'omega', 'neq', 'leq', 'geq', 'approx',
                'notin', 'times', 'infty',
                'rightarrow', 'leftarrow', 'leftrightarrow',
                'Rightarrow', 'Leftarrow', 'Leftrightarrow'
            ];

            for (const cmd of commands) {
                const pattern = new RegExp(`(^|[^\\\\])(${cmd})(?=\\b)`, 'g');
                out = out.replace(pattern, `$1\\${cmd}`);
            }

            // Normalize membership written as plain text ("in") inside math.
            // Example: "x, y in \\mathbb{C}^n" -> "x, y \\in \\mathbb{C}^n".
            out = out.replace(
                /([A-Za-z0-9_}\)\]])\s+in\s+(?=(\\mathbb|\\mathcal|\\mathbf|\\mathsf|\\mathfrak|[A-Z]))/g,
                '$1 \\in '
            );

            // Repair malformed closing angle command caused by escaped control chars
            // in source strings (e.g., "\\langle x,x \\rangle" becoming "\\langle x,x \\nangle").
            out = out.replace(/\\nangle\b/g, '\\rangle');

            return out;
        }

        function wrapLikelyMathParens(text) {
            if (!text || text.includes('\\(') || text.includes('\\[')) return text;
            const source = String(text);
            let result = '';
            let depth = 0;
            let blockStart = -1;
            let lastCommitted = 0;

            function isLikelyMath(innerText) {
                const normalizedInner = normalizeMathSegment(innerText);
                const looksMathy =
                    /[{}_^]|\\[a-zA-Z]+/.test(normalizedInner) ||
                    /\b[a-zA-Z]\s*=\s*[^=]/.test(normalizedInner) ||
                    /\b(i|pi|theta|alpha|beta|gamma|delta|lambda|mu|sigma|phi|psi|omega|sqrt|frac|bar|overline|mathbb|operatorname|langle|rangle|begin|end)\b/.test(normalizedInner);

                return {
                    normalizedInner,
                    looksMathy
                };
            }

            for (let i = 0; i < source.length; i++) {
                const ch = source[i];

                if (ch === '(') {
                    if (depth === 0) {
                        result += source.slice(lastCommitted, i);
                        blockStart = i;
                    }
                    depth++;
                    continue;
                }

                if (ch === ')' && depth > 0) {
                    depth--;
                    if (depth === 0 && blockStart !== -1) {
                        const inner = source.slice(blockStart + 1, i);
                        const { normalizedInner, looksMathy } = isLikelyMath(inner);
                        result += looksMathy ? `\\(${normalizedInner}\\)` : source.slice(blockStart, i + 1);
                        lastCommitted = i + 1;
                        blockStart = -1;
                    }
                }
            }

            if (lastCommitted === 0) {
                return source;
            }

            if (depth > 0 && blockStart !== -1) {
                result += source.slice(blockStart);
                return result;
            }

            if (lastCommitted < source.length) {
                result += source.slice(lastCommitted);
            }

            return result;
        }

        function normalizeMathText(value) {
            if (typeof value !== 'string') return value;
            let out = value;
            if (/<(gcb-math|div|span|p|br|ol|ul|li|table|thead|tbody|tr|th|td|strong|em|b|i|u|sub|sup|code|pre)\b/i.test(out)) {
                return out;
            }
            out = out.replace(/\\\((.*?)\\\)/gs, (_, inner) => `\\(${normalizeMathSegment(inner)}\\)`);
            out = out.replace(/\\\[(.*?)\\\]/gs, (_, inner) => `\\[${normalizeMathSegment(inner)}\\]`);
            out = wrapLikelyMathParens(out);
            return out;
        }

        function isLikelyMathOption(text) {
            const source = String(text || '').trim();
            if (!source) return false;

            // Command-based math is definitely math.
            if (/\\[a-zA-Z]+/.test(source)) return true;

            // Typical complex number forms: a+bi, a-bi, i, -i.
            if (/^[-+]?\d+(?:\.\d+)?\s*[+\-]\s*\d+(?:\.\d+)?\s*i$/i.test(source)) return true;
            if (/^[-+]?i$/i.test(source)) return true;

            // Algebraic/numeric expressions containing operators.
            if (/[=+\-*/^]/.test(source) && /[0-9a-zA-Z]/.test(source) && !/[a-z]{4,}/i.test(source)) return true;

            return false;
        }

        function normalizeOptionMathText(value) {
            if (typeof value !== 'string') return value;
            let out = normalizeMathText(value);
            if (out.includes('\\(') || out.includes('\\[') || out.includes('$$') || out.includes('$')) {
                return out;
            }

            const trimmed = out.trim();
            const hasOuterParens = trimmed.length >= 2 && trimmed.startsWith('(') && trimmed.endsWith(')');
            const candidate = hasOuterParens ? trimmed.slice(1, -1).trim() : trimmed;
            if (!isLikelyMathOption(candidate)) return out;

            const wrapped = `\\(${normalizeMathSegment(candidate)}\\)`;
            return wrapped;
        }

        function looksLikeStructuredHtmlContent(value) {
            return /<(gcb-math|div|span|p|br|ol|ul|li|table|thead|tbody|tr|th|td|strong|em|b|i|u|sub|sup|code|pre)\b/i.test(String(value || ''));
        }

        function sanitizeRichHtml(content) {
            const template = document.createElement('template');
            template.innerHTML = String(content || '');

            const allowedTags = new Set([
                'div', 'span', 'p', 'br', 'ol', 'ul', 'li',
                'table', 'thead', 'tbody', 'tr', 'th', 'td',
                'strong', 'em', 'b', 'i', 'u', 'sub', 'sup',
                'code', 'pre'
            ]);

            const allowedClasses = new Set([
                'inline-equation',
                'display-equation',
                'equation'
            ]);

            function sanitizeClassName(className) {
                const tokens = String(className || '')
                    .split(/\s+/)
                    .map(token => token.trim())
                    .filter(Boolean)
                    .filter(token => allowedClasses.has(token));
                return tokens.join(' ');
            }

            function getKatexTex(node) {
                if (!node || node.nodeType !== Node.ELEMENT_NODE) return '';
                const annotation = node.matches('annotation[encoding="application/x-tex"]')
                    ? node
                    : node.querySelector('annotation[encoding="application/x-tex"]');
                if (!annotation) return '';
                return normalizeMathSegment((annotation.textContent || '').trim());
            }

            function sanitizeNode(node) {
                if (node.nodeType === Node.TEXT_NODE) {
                    return escapeHtml(normalizeMathText(node.textContent || ''));
                }

                if (node.nodeType !== Node.ELEMENT_NODE) {
                    return '';
                }

                const tag = node.tagName.toLowerCase();

                if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed') {
                    return '';
                }

                const isKatexDisplay = node.classList.contains('katex-display') || !!node.closest('.katex-display');
                if (node.classList.contains('katex-display') || node.classList.contains('katex') || node.classList.contains('katex-mathml')) {
                    const tex = getKatexTex(node);
                    if (tex) {
                        return isKatexDisplay ? `\\[${tex}\\]` : `\\(${tex}\\)`;
                    }
                }

                if (node.classList.contains('katex-html') || node.closest('.katex-html')) {
                    return '';
                }

                if (tag === 'annotation' && String(node.getAttribute('encoding') || '').toLowerCase() === 'application/x-tex') {
                    return '';
                }

                if (tag === 'gcb-math') {
                    const latex = normalizeMathSegment((node.textContent || '').trim());
                    if (!latex) return '';
                    const isDisplay = node.hasAttribute('display') || node.classList.contains('display');
                    return isDisplay ? `\\[${latex}\\]` : `\\(${latex}\\)`;
                }

                const childrenHtml = Array.from(node.childNodes).map(sanitizeNode).join('');

                if (!allowedTags.has(tag)) {
                    return childrenHtml;
                }

                if (tag === 'br') {
                    return '<br>';
                }

                let attrs = '';
                if (tag === 'span' || tag === 'div' || tag === 'p') {
                    const cls = sanitizeClassName(node.getAttribute('class'));
                    if (cls) {
                        attrs += ` class="${escapeHtml(cls)}"`;
                    }
                }

                return `<${tag}${attrs}>${childrenHtml}</${tag}>`;
            }

            return Array.from(template.content.childNodes).map(sanitizeNode).join('');
        }

        function renderTextWithMathMarkup(value) {
            const text = String(value || '');
            if (!text) return '';
            if (looksLikeStructuredHtmlContent(text)) {
                return sanitizeRichHtml(text);
            }
            return escapeHtml(normalizeMathText(text));
        }

        function renderOptionContent(value) {
            const text = String(value || '');
            if (!text) return '';
            if (looksLikeStructuredHtmlContent(text)) {
                return sanitizeRichHtml(text);
            }
            return escapeHtml(normalizeOptionMathText(text));
        }

        function normalizeQuestionMath(question) {
            if (Array.isArray(question)) {
                return question.map(normalizeQuestionMath);
            }
            if (!question || typeof question !== 'object') {
                return normalizeMathText(question);
            }

            const out = {};
            Object.keys(question).forEach((key) => {
                const value = question[key];
                if (typeof value === 'string') {
                    out[key] = normalizeMathText(value);
                } else if (Array.isArray(value) || (value && typeof value === 'object')) {
                    out[key] = normalizeQuestionMath(value);
                } else {
                    out[key] = value;
                }
            });
            return out;
        }

        function parseBooleanLike(value) {
            if (typeof value === 'boolean') return value;
            if (typeof value === 'number') return value !== 0;

            const text = String(value || '').trim().toLowerCase();
            if (text === 'true' || text === 't' || text === '1' || text === 'yes') return true;
            if (text === 'false' || text === 'f' || text === '0' || text === 'no') return false;
            return false;
        }

        function normalizeQuestionType(typeValue) {
            const rawType = String(typeValue || '').trim().toLowerCase();
            if (!rawType) return rawType;

            const aliases = {
                checkbox: 'msq',
                checkboxes: 'msq',
                multiselect: 'msq',
                'multi-select': 'msq',
                multiple: 'msq',
                single: 'mcq',
                singlechoice: 'mcq',
                'single-choice': 'mcq',
                tf: 'truefalse',
                'true/false': 'truefalse',
                'true-false': 'truefalse'
            };

            return aliases[rawType] || rawType;
        }

        function toIntegerArray(value) {
            if (Array.isArray(value)) {
                return value.map(v => Number(v)).filter(Number.isInteger);
            }
            if (typeof value === 'number') {
                return Number.isInteger(value) ? [value] : [];
            }
            if (typeof value === 'string') {
                const tokens = value.split(/[\s,;|]+/).filter(Boolean);
                return tokens.map(token => Number(token)).filter(Number.isInteger);
            }
            return [];
        }

        function normalizeQuestionShape(question) {
            if (!question || typeof question !== 'object') {
                return question;
            }

            const type = normalizeQuestionType(question.type);
            const normalized = {
                ...question,
                type
            };

            if (type === 'msq') {
                const fromCorrectIndices = toIntegerArray(question.correctIndices);
                const fromCorrect = toIntegerArray(question.correct);
                const optionCount = Array.isArray(question.options) ? question.options.length : 0;

                normalized.correctIndices = [...new Set(
                    (fromCorrectIndices.length ? fromCorrectIndices : fromCorrect)
                        .filter(index => index >= 0 && (optionCount === 0 || index < optionCount))
                )];
            }

            return normalized;
        }

        function normalizeTrueFalseQuestion(question) {
            if (!question || String(question.type || '').toLowerCase() !== 'truefalse') {
                return question;
            }

            return {
                ...question,
                correct: parseBooleanLike(question.correct),
                options: ['True', 'False']
            };
        }

        function renderInlineMarkdown(text) {
            function renderSingleQuotedAsCode(segment) {
                const escaped = escapeHtml(segment);
                return escaped.replace(
                    /(^|[\s([{-])&#39;([^<\n]+?)&#39;(?=($|[\s).,;:!?}\]-]))/g,
                    (_, prefix, value) => `${prefix}<code>${value}</code>`
                );
            }

            return String(text || '')
                .split(/(`[^`]*`)/g)
                .map(part => {
                    if (part.startsWith('`') && part.endsWith('`')) {
                        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
                    }
                    return renderSingleQuotedAsCode(part);
                })
                .join('');
        }

        function sanitizeSolutionHtml(content) {
            const text = String(content || '');
            if (!text) return '';
            if (looksLikeStructuredHtmlContent(text)) {
                return sanitizeRichHtml(text);
            }
            return renderInlineMarkdown(normalizeMathText(text)).replace(/\n/g, '<br>');
        }

        // Render plain text with support for markdown-style tables used in question statements.
        function renderQuestionText(text) {
            const trimmedWholeText = String(text || '').trim();

            if (looksLikeStructuredHtmlContent(trimmedWholeText)) {
                return sanitizeRichHtml(trimmedWholeText);
            }

            if (/^<[^>]+>[\s\S]*<\/[a-z][^>]*>$/i.test(trimmedWholeText) && !trimmedWholeText.includes('\n')) {
                return renderCodeBlock(trimmedWholeText, 'html');
            }

            const lines = String(text || '').split('\n');
            const htmlParts = [];
            let paragraphBuffer = [];

            function flushParagraph() {
                if (!paragraphBuffer.length) return;
                const paragraphHtml = renderInlineMarkdown(paragraphBuffer.join('\n')).replace(/\n/g, '<br>');
                htmlParts.push(`<p>${paragraphHtml}</p>`);
                paragraphBuffer = [];
            }

            function isTableRow(line) {
                const trimmed = line.trim();
                return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length >= 3;
            }

            function isSeparatorRow(line) {
                const trimmed = line.trim();
                if (!trimmed.includes('-')) return false;
                return /^\|[\s:|\-]+\|$/.test(trimmed);
            }

            function parseTableCells(line) {
                return line
                    .trim()
                    .slice(1, -1)
                    .split('|')
                    .map(cell => cell.trim());
            }

            let i = 0;
            while (i < lines.length) {
                const line = lines[i];
                const trimmedLine = line.trim();
                const imageMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);

                if (trimmedLine.startsWith('```')) {
                    flushParagraph();
                    const codeLanguage = trimmedLine.slice(3).trim();
                    i++;
                    const codeLines = [];
                    while (i < lines.length && !lines[i].trim().startsWith('```')) {
                        codeLines.push(lines[i]);
                        i++;
                    }
                    if (i < lines.length && lines[i].trim().startsWith('```')) {
                        i++;
                    }
                    htmlParts.push(renderCodeBlock(codeLines.join('\n'), codeLanguage));
                    continue;
                }

                if (imageMatch) {
                    flushParagraph();
                    const altText = imageMatch[1] || 'Question image';
                    const imageUrl = sanitizeMediaUrl(imageMatch[2]);
                    if (imageUrl) {
                        htmlParts.push(`
                            <figure class="question-image-wrap">
                                <img class="question-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(altText)}" loading="lazy" />
                            </figure>
                        `);
                    }
                    i++;
                    continue;
                }

                // Detect markdown table block: header row + separator row + body rows.
                if (isTableRow(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
                    flushParagraph();

                    const headerCells = parseTableCells(lines[i]);
                    i += 2; // Skip header + separator

                    const bodyRows = [];
                    while (i < lines.length && isTableRow(lines[i])) {
                        bodyRows.push(parseTableCells(lines[i]));
                        i++;
                    }

                    const headerHtml = `<tr>${headerCells.map(cell => `<th>${escapeHtml(cell)}</th>`).join('')}</tr>`;
                    const bodyHtml = bodyRows
                        .map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
                        .join('');

                    htmlParts.push(`
                        <div class="question-table-wrap">
                            <table class="question-markdown-table">
                                <thead>${headerHtml}</thead>
                                <tbody>${bodyHtml}</tbody>
                            </table>
                        </div>
                    `);
                    continue;
                }

                if (line.trim() === '') {
                    flushParagraph();
                } else {
                    paragraphBuffer.push(line);
                }
                i++;
            }

            flushParagraph();
            return htmlParts.join('');
        }

        function renderQuestionMedia(question) {
            const items = [];

            if (question.image || question.imageUrl || question.imageSrc || question.imagePath) {
                items.push({
                    src: question.image || question.imageUrl || question.imageSrc || question.imagePath,
                    alt: question.imageAlt || question.alt || 'Question image',
                    caption: question.imageCaption || ''
                });
            }

            if (Array.isArray(question.images)) {
                question.images.forEach((img, idx) => {
                    if (typeof img === 'string') {
                        items.push({ src: img, alt: `Question image ${idx + 1}`, caption: '' });
                    } else if (img && typeof img === 'object') {
                        items.push({
                            src: img.src || img.url || img.path,
                            alt: img.alt || `Question image ${idx + 1}`,
                            caption: img.caption || ''
                        });
                    }
                });
            }

            const safeItems = items
                .map(img => ({
                    src: sanitizeMediaUrl(img.src),
                    alt: img.alt,
                    caption: img.caption
                }))
                .filter(img => img.src);

            if (!safeItems.length) return '';

            return safeItems.map(img => `
                <figure class="question-image-wrap">
                    <img class="question-image" src="${escapeHtml(img.src)}" alt="${escapeHtml(img.alt || 'Question image')}" loading="lazy" />
                    ${img.caption ? `<figcaption class="question-image-caption">${escapeHtml(img.caption)}</figcaption>` : ''}
                </figure>
            `).join('');
        }

        // Helper to render choices based on question type
        function renderChoices(q, idx) {
            let html = '';
            if (q.type === 'mcq') {
                for (let c = 0; c < q.options.length; c++) {
                    const optionText = renderOptionContent(q.options[c]);
                    html += `
                        <div class="gcb-mcq-choice" data-choice-idx="${c}">
                            <input type="radio" name="q_${idx}" value="${c}" id="q${idx}_c${c}">
                            <label for="q${idx}_c${c}">${optionText}</label>
                        </div>
                    `;
                }
            } else if (q.type === 'msq') {
                for (let c = 0; c < q.options.length; c++) {
                    const optionText = renderOptionContent(q.options[c]);
                    html += `
                        <div class="gcb-mcq-choice" data-choice-idx="${c}">
                            <input type="checkbox" name="q_${idx}" value="${c}" id="q${idx}_c${c}">
                            <label for="q${idx}_c${c}">${optionText}</label>
                        </div>
                    `;
                }
            } else if (q.type === 'nat') {
                html = `
                    <div style="margin-top: 8px;">
                        <input type="number" id="q${idx}_num" name="q_${idx}" style="padding: 8px; width: 200px; border: 1px solid #ccc; border-radius: 8px;" placeholder="Enter a number">
                    </div>
                `;
            } else if (q.type === 'truefalse') {
                html = `
                    <div class="radio-group truefalse-group">
                        <label class="tf-option"><input type="radio" name="q_${idx}" value="true"> True</label>
                        <label class="tf-option"><input type="radio" name="q_${idx}" value="false"> False</label>
                    </div>
                `;
            } else if (q.type === 'assertionreason') {
                html = `
                    <div class="assertion-group">
                        <strong>Assertion (A):</strong> ${renderTextWithMathMarkup(q.assertion)}<br>
                        <strong>Reason (R):</strong> ${renderTextWithMathMarkup(q.reason)}
                    </div>
                    <div style="margin-top: 12px;">
                        ${q.options.map((opt, oidx) => `
                            <div class="gcb-mcq-choice" data-choice-idx="${oidx}">
                                <input type="radio" name="q_${idx}" value="${oidx}" id="q${idx}_c${oidx}">
                                <label for="q${idx}_c${oidx}">${renderOptionContent(opt)}</label>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else if (q.type === 'numstatements') {
                html = `
                    <ul class="statement-list">
                        ${q.statements.map(stmt => `<li>${renderTextWithMathMarkup(stmt)}</li>`).join('')}
                    </ul>
                    <div style="margin-top: 8px;">
                        <input type="number" id="q${idx}_num" name="q_${idx}" style="padding: 8px; width: 100px; border: 1px solid #ccc; border-radius: 8px;" placeholder="Count">
                    </div>
                `;
            } else if (q.type === 'match') {
                html = `
                    <table class="match-table">
                        ${q.leftItems.map((left, lidx) => `
                            <tr>
                                <td><strong>${renderTextWithMathMarkup(left)}</strong></td>
                                <td>
                                    <select id="match_${idx}_${lidx}" data-match-index="${lidx}">
                                        <option value="">-- Select --</option>
                                        ${q.rightItems.map((right, ridx) => `<option value="${ridx}">${escapeHtml(String(right || ''))}</option>`).join('')}
                                    </select>
                                </td>
                            </tr>
                        `).join('')}
                    </table>
                `;
            }
            return html;
        }

        // Helper to get correct answer text for display
        function getCorrectText(q) {
            if (q.type === 'mcq') return q.options[q.correct];
            if (q.type === 'msq') return q.correctIndices.map(i => q.options[i]).join('; ');
            if (q.type === 'nat') return q.correct.toString();
            if (q.type === 'truefalse') return q.correct ? 'True' : 'False';
            if (q.type === 'assertionreason') return q.options[q.correct];
            if (q.type === 'numstatements') return q.correctCount.toString();
            if (q.type === 'match') return q.leftItems.map((_, i) => `${q.leftItems[i]} → ${q.rightItems[q.correctMatches[i]]}`).join('; ');
            return '';
        }

        function renderCorrectTextContent(value) {
            const text = String(value || '');
            if (!text) return '';
            if (looksLikeStructuredHtmlContent(text)) {
                return sanitizeRichHtml(text);
            }
            return escapeHtml(normalizeMathText(text));
        }

        // Helper to get user selected values
        function getUserSelection(container, q, idx) {
            if (q.type === 'mcq') {
                const selected = container.querySelector('input:checked');
                return selected ? [parseInt(selected.value)] : [];
            }
            if (q.type === 'msq') {
                const selected = Array.from(container.querySelectorAll('input:checked'));
                return selected.map(cb => parseInt(cb.value));
            }
            if (q.type === 'nat' || q.type === 'numstatements') {
                const input = document.getElementById(`q${idx}_num`);
                if (input && input.value !== '') return [parseFloat(input.value)];
                return [];
            }
            if (q.type === 'truefalse') {
                const selected = container.querySelector('input:checked');
                if (selected) return [selected.value === 'true'];
                return [];
            }
            if (q.type === 'assertionreason') {
                const selected = container.querySelector('input:checked');
                return selected ? [parseInt(selected.value)] : [];
            }
            if (q.type === 'match') {
                const matches = [];
                for (let i = 0; i < q.leftItems.length; i++) {
                    const select = document.getElementById(`match_${idx}_${i}`);
                    if (select && select.value !== '') matches.push(parseInt(select.value));
                    else matches.push(null);
                }
                return matches;
            }
            return [];
        }

        const normalizedQuestionsData = window.questionsData
            .map(normalizeQuestionMath)
            .map(normalizeQuestionShape)
            .map(normalizeTrueFalseQuestion);

        // Build HTML
        let html = '';
        for (let idx = 0; idx < normalizedQuestionsData.length; idx++) {
            const q = normalizedQuestionsData[idx];
            const choicesHtml = renderChoices(q, idx);
            const questionMediaHtml = renderQuestionMedia(q);
            const correctText = getCorrectText(q);
            const difficultyClass = `difficulty-${String(q.difficulty || 'unknown').trim().toLowerCase().replace(/\s+/g, '-')}`;
            // Use detailed solution if available, otherwise fallback to explanation
            const solutionContent = sanitizeSolutionHtml(q.detailed ? q.detailed : q.explanation);
            html += `
                <div class="question-card" data-qidx="${idx}" data-type="${q.type}">
                    <div class="question-number">Question ${idx + 1}</div>
                    <div class="badge-row">
                        <span class="difficulty-badge ${difficultyClass}">${escapeHtml(q.difficulty || 'Unknown')}</span>
                        <div class="qt-points">${q.points} point${q.points !== 1 ? 's' : ''}</div>
                    </div>
                    <div class="qt-question">
                        ${renderQuestionText(q.text)}
                    </div>
                    ${questionMediaHtml}
                    <div class="qt-choices" id="choices_${idx}">
                        ${choicesHtml}
                    </div>
                    <button class="check-btn" data-btn-idx="${idx}">Check Answer</button>
                    <div id="sol_${idx}" class="solution-area">
                        <div class="feedback-message" id="feedback_${idx}"></div>
                        <div><span class="correct-badge">Correct Option(s):</span> 
                            <span class="correct-options-text"><strong>${renderCorrectTextContent(correctText)}</strong></span>
                        </div>
                        <div class="solution-text"><strong>Detailed Solution</strong><br><div class="step">${solutionContent}</div></div>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
        renderMath(container);
        ensureHighlightJsAssets().then(() => {
            applySyntaxHighlighting(container);
        });

        // Attach event listeners
        document.querySelectorAll('.check-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const qIdx = parseInt(this.getAttribute('data-btn-idx'));
                const q = normalizedQuestionsData[qIdx];
                const choicesContainer = document.getElementById(`choices_${qIdx}`);
                const solutionDiv = document.getElementById(`sol_${qIdx}`);
                const feedbackDiv = document.getElementById(`feedback_${qIdx}`);

                const userSelection = getUserSelection(choicesContainer, q, qIdx);
                let isCorrect = false;
                let feedbackText = '';
                let feedbackClass = '';

                // Determine correctness based on type
                if (q.type === 'mcq') {
                    const correctVal = q.correct;
                    isCorrect = (userSelection.length === 1 && userSelection[0] === correctVal);
                    feedbackText = isCorrect ? 'Correct! Your answer matches.' : `Incorrect. The correct answer is: ${q.options[correctVal]}.`;
                    feedbackClass = isCorrect ? 'feedback-correct' : 'feedback-incorrect';
                } else if (q.type === 'msq') {
                    const correctSet = new Set(q.correctIndices);
                    const userSet = new Set(userSelection);
                    const allCorrect = q.correctIndices.every(v => userSet.has(v));
                    const noWrong = userSelection.every(v => correctSet.has(v));
                    if (allCorrect && noWrong && userSelection.length === q.correctIndices.length) {
                        isCorrect = true;
                        feedbackText = 'Perfect! You selected all correct options.';
                        feedbackClass = 'feedback-correct';
                    } else if (allCorrect && noWrong && userSelection.length < q.correctIndices.length) {
                        isCorrect = false;
                        feedbackText = `Partially correct. You missed some. Full correct: ${q.correctIndices.map(i => q.options[i]).join('; ')}.`;
                        feedbackClass = 'feedback-partial';
                    } else {
                        isCorrect = false;
                        feedbackText = `Incorrect. Correct options: ${q.correctIndices.map(i => q.options[i]).join('; ')}.`;
                        feedbackClass = 'feedback-incorrect';
                    }
                } else if (q.type === 'nat') {
                    const correctNum = q.correct;
                    const userNum = userSelection[0];
                    isCorrect = (Math.abs(userNum - correctNum) < 1e-6);
                    feedbackText = isCorrect ? 'Correct!' : `Incorrect. The correct answer is ${correctNum}.`;
                    feedbackClass = isCorrect ? 'feedback-correct' : 'feedback-incorrect';
                } else if (q.type === 'truefalse') {
                    const correctBool = parseBooleanLike(q.correct);
                    const userBool = userSelection[0];
                    isCorrect = (userBool === correctBool);
                    feedbackText = isCorrect ? 'Correct!' : `Incorrect. The correct answer is ${correctBool ? 'True' : 'False'}.`;
                    feedbackClass = isCorrect ? 'feedback-correct' : 'feedback-incorrect';
                } else if (q.type === 'assertionreason') {
                    const correctIdx = q.correct;
                    isCorrect = (userSelection.length === 1 && userSelection[0] === correctIdx);
                    feedbackText = isCorrect ? 'Correct!' : `Incorrect. The correct choice is: ${q.options[correctIdx]}.`;
                    feedbackClass = isCorrect ? 'feedback-correct' : 'feedback-incorrect';
                } else if (q.type === 'numstatements') {
                    const correctCount = q.correctCount;
                    const userCount = userSelection[0];
                    isCorrect = (userCount === correctCount);
                    feedbackText = isCorrect ? 'Correct!' : `Incorrect. The correct number of statements is ${correctCount}.`;
                    feedbackClass = isCorrect ? 'feedback-correct' : 'feedback-incorrect';
                } else if (q.type === 'match') {
                    const correctMatches = q.correctMatches;
                    let allMatch = true;
                    for (let i = 0; i < correctMatches.length; i++) {
                        if (userSelection[i] !== correctMatches[i]) allMatch = false;
                    }
                    isCorrect = allMatch;
                    feedbackText = isCorrect ? 'Perfect match!' : 'Incorrect matching. Please review the correct pairings above.';
                    feedbackClass = isCorrect ? 'feedback-correct' : 'feedback-incorrect';
                }

                feedbackDiv.textContent = feedbackText;
                feedbackDiv.className = `feedback-message ${feedbackClass}`;

                // Highlight correct options for MCQ/MSQ/AssertionReason
                if (q.type === 'mcq' || q.type === 'msq' || q.type === 'assertionreason') {
                    const allChoiceDivs = choicesContainer.querySelectorAll('.gcb-mcq-choice');
                    allChoiceDivs.forEach(div => {
                        div.classList.remove('highlight-correct');
                        div.classList.remove('user-wrong');
                    });
                    let correctIndices = [];
                    if (q.type === 'mcq') correctIndices = [q.correct];
                    else if (q.type === 'msq') correctIndices = q.correctIndices;
                    else if (q.type === 'assertionreason') correctIndices = [q.correct];

                    correctIndices.forEach(cidx => {
                        const targetDiv = choicesContainer.querySelector(`.gcb-mcq-choice[data-choice-idx="${cidx}"]`);
                        if (targetDiv) targetDiv.classList.add('highlight-correct');
                    });
                    if (!isCorrect && (q.type === 'mcq' || q.type === 'msq')) {
                        const userWrong = userSelection.filter(v => !correctIndices.includes(v));
                        userWrong.forEach(cidx => {
                            const targetDiv = choicesContainer.querySelector(`.gcb-mcq-choice[data-choice-idx="${cidx}"]`);
                            if (targetDiv) targetDiv.classList.add('user-wrong');
                        });
                    }
                }

                // Show solution area if not already visible
                if (solutionDiv && !solutionDiv.classList.contains('show')) {
                    solutionDiv.classList.add('show');
                    ensureHighlightJsAssets().then(() => {
                        applySyntaxHighlighting(solutionDiv);
                    });
                    solutionDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            });
        });
    });
})();