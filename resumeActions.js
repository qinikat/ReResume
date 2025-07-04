// resumeActions.js


/**
 * 从下拉框中选择一个选项。
 * 这个函数会尝试处理原生的 <select> 元素和常见的模拟下拉框。
 *
 * @param {import('puppeteer').Page} page Puppeteer 页面对象。
 * @param {import('puppeteer').ElementHandle} dropdownElement 下拉框的 ElementHandle。
 * @param {string} optionText 要选择的选项的文本。
 * @param {number} delay 每次操作后的延迟。
 * @returns {Promise<boolean>} 如果成功选择则为 true，否则为 false。
 */
async function selectDropdownOption(page, dropdownElement, optionText, delay = 200) {
    if (!dropdownElement) {
        console.error('[下拉选择] 无效的下拉框元素。');
        return false;
    }

    const xpath = await getXPathForElement(dropdownElement);
    console.log(`[下拉选择] 尝试在下拉框 ${xpath} 中选择选项："${optionText}"`);

    // 尝试处理原生的 <select> 元素
    const isSelectTag = await dropdownElement.evaluate(el => el.tagName === 'SELECT');
    if (isSelectTag) {
        try {
            await dropdownElement.select(optionText); // Puppeteer 的原生 select 方法
            console.log(`[下拉选择] 成功通过原生 select 方法选择："${optionText}"`);
            await new Promise(r => setTimeout(r, delay));
            return true;
        } catch (e) {
            console.warn(`[下拉选择] 原生 select 方法失败，尝试模拟点击: ${e.message}`);
            // 继续尝试模拟点击
        }
    }

    // 尝试处理模拟下拉框 (例如 Ant Design, Element UI, 或自定义的 div/span 模拟)
    try {
        // 1. 点击下拉框本身以展开选项列表
        const box = await dropdownElement.boundingBox();
        if (!box || box.width === 0 || box.height === 0) {
            console.error(`[下拉选择] 下拉框元素 ${xpath} 不可见或无 boundingBox。`);
            return false;
        }
        await dropdownElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, delay / 2));
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        console.log(`[下拉选择] 已点击下拉框以展开选项。`);
        await new Promise(r => setTimeout(r, delay)); // 等待选项列表展开

        // 2. 查找并点击包含目标文本的选项
        const optionSelectors = [
            `span[title*="${optionText}" i]`,
            `div[title*="${optionText}" i]`,
            `li[role="option"]:has-text("${optionText}" i)`,
            `div[role="option"]:has-text("${optionText}" i)`,
            `div.el-select-dropdown__item:has-text("${optionText}" i)`,
            `div[class*="option"]:has-text("${optionText}" i)`,
            `li:has-text("${optionText}" i)`,
            `div:has-text("${optionText}" i)`,
        ];

        let selectedOption = null;
        for (const selector of optionSelectors) {
            const options = await page.$$(selector);
            for (const optionEl of options) {
                const textContent = await optionEl.evaluate(el => el.innerText || el.textContent);
                if (textContent && textContent.trim().includes(optionText) && textContent.trim().length <= optionText.length + 5) {
                    const optionBox = await optionEl.boundingBox();
                    if (optionBox && optionBox.width > 0 && optionBox.height > 0 && optionBox.y >= 0 && optionBox.y <= page.viewport().height) {
                        selectedOption = optionEl;
                        break;
                    }
                }
                await optionEl.dispose();
            }
            if (selectedOption) break;
        }

        if (selectedOption) {
            const optionBox = await selectedOption.boundingBox();
            await selectedOption.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            await new Promise(r => setTimeout(r, delay / 2));
            await page.mouse.click(optionBox.x + optionBox.width / 2, optionBox.y + optionBox.height / 2);
            console.log(`[下拉选择] 成功通过模拟点击选择："${optionText}"`);
            await new Promise(r => setTimeout(r, delay / 2)); // 稍微等待点击生效

            // *** 新增：模拟按下回车键以确认选择或关闭下拉框 ***
            await page.keyboard.press('Enter');
            console.log(`[下拉选择] 已模拟按下 'Enter' 键。`);
            await new Promise(r => setTimeout(r, delay / 2)); // 等待回车键操作生效

            await selectedOption.dispose();
            return true;
        } else {
            console.warn(`[下拉选择] 未能在展开的下拉选项中找到文本为 "${optionText}" 的选项。`);
            return false;
        }

    } catch (e) {
        console.error(`[下拉选择] 选择下拉框选项时发生错误: ${e.message}`);
        return false;
    }
}

/**
 * 获取元素的 XPath。用于调试日志。
 * @param {import('puppeteer').ElementHandle|import('puppeteer').Page} elementHandle Puppeteer ElementHandle 或 Page 对象。
 * @returns {Promise<string>} 元素的 XPath 或 'N/A'。
 */
async function getXPathForElement(elementHandle) {
    if (!elementHandle) return 'N/A (null/undefined element)';
    if (elementHandle.constructor.name === 'Page') return 'Page Root';

    try {
        const jsHandle = await elementHandle.evaluateHandle(el => {
            if (!el || typeof el.tagName !== 'string') return '';
            let xpath = '';
            for (; el && el.nodeType === 1; el = el.parentNode) {
                let id = el.hasAttribute('id') ? `[@id="${el.id}"]` : '';
                let tagName = el.tagName.toLowerCase();
                let index = 1;
                // 仅当没有id且有多个同名兄弟时才计算索引
                if (!id && el.parentNode) {
                    let siblings = Array.from(el.parentNode.children).filter(child => child.tagName.toLowerCase() === tagName);
                    if (siblings.length > 1) {
                        index = siblings.indexOf(el) + 1;
                    }
                }
                let position = id ? '' : (index > 1 ? `[${index}]` : '');
                xpath = `/${tagName}${id}${position}` + xpath;
                if (id) break;
            }
            return xpath;
        });
        const xpathString = await jsHandle.jsonValue();
        await jsHandle.dispose();
        return xpathString;
    } catch (e) {
        return `无法获取XPath: ${e.message}`;
    }
}

/**
 * 计算元素在 DOM 树中的深度。
 * @param {import('puppeteer').ElementHandle} elementHandle Puppeteer ElementHandle.
 * @returns {Promise<number>} 元素的深度。
 */
async function getElementDepth(elementHandle) {
    if (!elementHandle) return 0;
    return await elementHandle.evaluate((el) => {
        let depth = 0;
        let current = el;
        while (current && current.parentNode && current.parentNode !== document.body && current.parentNode !== document.documentElement) {
            current = current.parentNode;
            depth++;
        }
        return depth;
    });
}

/**
 * 查找两个 Puppeteer ElementHandle 的最近公共祖先 (LCA)。
 * @param {import('puppeteer').Page} page Puppeteer 页面对象。
 * @param {import('puppeteer').ElementHandle} el1 第一个元素句柄。
 * @param {import('puppeteer').ElementHandle} el2 第二个元素句柄。
 * @returns {Promise<import('puppeteer').ElementHandle|null>} 最近公共祖先的 ElementHandle，如果不存在则为 null。
 */
async function getLowestCommonAncestor(page, el1, el2) {
    if (!el1 || !el2) return null;

    return await page.evaluateHandle((node1, node2) => {
        if (!node1 || !node2) return null;

        const getPath = (node) => {
            const path = [];
            while (node) {
                path.unshift(node);
                node = node.parentNode;
            }
            return path;
        };

        const path1 = getPath(node1);
        const path2 = getPath(node2);

        let lca = null;
        const minLength = Math.min(path1.length, path2.length);

        for (let i = 0; i < minLength; i++) {
            if (path1[i] === path2[i]) {
                lca = path1[i];
            } else {
                break;
            }
        }
        return lca;
    }, el1, el2);
}

/**
 * 搜索所有包含给定关键词的可见且可点击的元素。
 * @param {import('puppeteer').Page} page Puppeteer 页面对象。
 * @param {string[]} keywords 关键词数组。
 * @returns {Promise<import('puppeteer').ElementHandle[]>} 匹配的可见且未禁用的元素数组。
 */
async function getAllClickableElementsWithKeywords(page, keywords) {
    const clickableElements = [];
    const selectors = ['button', 'a', '[role="button"]', 'input[type="button"]', 'input[type="submit"]', '[class*="button"]', '[class*="btn"]'];

    for (const selector of selectors) {
        const elements = await page.$$(selector);
        for (const el of elements) {
            const text = await page.evaluate(node => node.innerText || node.textContent || '', el);
            const keywordFound = keywords.some(keyword => text.toLowerCase().includes(keyword.toLowerCase()));

            if (keywordFound) {
                const box = await el.boundingBox();
                const isDisabled = await page.evaluate(e => e.disabled || e.getAttribute('aria-disabled') === 'true', el);

                if (box && !isDisabled && text.length < 200 && box.width > 0 && box.height > 0 && box.width < page.viewport().width * 0.7 && box.height < page.viewport().height * 0.7) {
                    clickableElements.push(el);
                } else {
                    await el.dispose();
                }
            } else {
                await el.dispose();
            }
        }
    }
    return clickableElements;
}

/**
 * 查找页面中指定标题的元素并滚动到视图。
 * @param {import('puppeteer').Page} page Puppeteer 页面对象。
 * @param {string} titleText 要查找的标题文本 (例如: "项目经历")。
 * @param {number} delay 滚动后的延迟时间。
 * @returns {Promise<import('puppeteer').ElementHandle|null>} 找到的标题元素句柄，或 null。
 */
async function findSectionTitle(page, titleTexts, delay = 500) {
    // 确保 titleTexts 是一个数组，以便统一处理
    const labelsToTry = Array.isArray(titleTexts) ? titleTexts : [titleTexts];
    console.log(`[查找标题] 尝试找到标题："${labelsToTry.join('", "')}" ...`);

    const possibleSectionElements = await page.$$('h1, h2, h3, h4, h5, h6, div, span, p');
    let foundElement = null; // 用于存储最终找到的元素

    for (const el of possibleSectionElements) {
        const textContent = await page.evaluate(node => node.innerText || node.textContent || '', el);
        // 遍历所有可能的标题文本
        for (const title of labelsToTry) {
            // 使用 includes 进行宽松匹配，并检查长度，防止匹配到过长的无关文本
            if (textContent.includes(title) && textContent.trim().length <= title.length + 20) { // 增加匹配长度的容忍度
                const box = await el.boundingBox();
                if (box && box.width > 0 && box.height > 0) {
                    console.log(`[查找标题] 找到 "${title}" 标题：${await getXPathForElement(el)}`);
                    await el.scrollIntoView();
                    await new Promise(r => setTimeout(r, delay));
                    foundElement = el; // 找到了，保存当前元素
                    break; // 跳出内部循环，因为已找到匹配的标题
                }
            }
        }
        if (foundElement) {
            // 如果已经找到元素，就不再处理其他 possibleSectionElements
            // 释放所有其他未使用的句柄
            for (const otherEl of possibleSectionElements) {
                if (otherEl !== foundElement) await otherEl.dispose();
            }
            return foundElement; // 返回找到的元素
        } else {
            await el.dispose(); // 如果当前元素不匹配任何标题，则释放句柄
        }
    }

    console.error(`[查找标题] 未找到任何符合标题："${labelsToTry.join('", "')}" 的清晰标题或其不可见。`);
    return null;
}

/**
 * 找到与给定标题元素最相关的“添加”按钮并点击它。
 * @param {import('puppeteer').Page} page Puppeteer 页面对象。
 * @param {import('puppeteer').ElementHandle} sectionTitleElement 对应的标题元素句柄。
 * @param {string[]} buttonKeywords “添加”按钮的关键词，例如 ['添加项目', '添加']。
 * @param {number} delay 点击后的延迟时间。
 * @returns {Promise<import('puppeteer').ElementHandle|null>} 成功点击的按钮元素句柄，或 null。
 */
async function findAddButtonAndClick(page, sectionTitleElement, buttonKeywords, delay = 500) {
    console.log(`[点击按钮] 正在寻找与 "${await getXPathForElement(sectionTitleElement)}" 具有最长共同路径的“添加”按钮...`);
    let bestAddButton = null;
    let maxCommonPathLength = -1;
    let minDistance = Infinity;

    const sectionTitleBox = await sectionTitleElement.boundingBox();
    if (!sectionTitleBox) {
        console.error('[点击按钮] 标题元素无 boundingBox，无法计算距离和位置。');
        return null;
    }
    const sectionTitleCenterX = sectionTitleBox.x + sectionTitleBox.width / 2;
    const sectionTitleCenterY = sectionTitleBox.y + sectionTitleBox.height / 2;

    const allAddButtons = await getAllClickableElementsWithKeywords(page, buttonKeywords);

    if (allAddButtons.length === 0) {
        console.error('[点击按钮] 未找到任何可见的、符合条件的“添加”按钮。');
        return null;
    }
    console.log(`[点击按钮] 找到 ${allAddButtons.length} 个可能的“添加”按钮候选项。`);

    for (const buttonCandidate of allAddButtons) {
        const buttonBox = await buttonCandidate.boundingBox();
        if (!buttonBox) {
            await buttonCandidate.dispose();
            continue;
        }

        const lcaHandle = await getLowestCommonAncestor(page, sectionTitleElement, buttonCandidate);
        const currentCommonPathLength = lcaHandle ? await getElementDepth(lcaHandle) : 0;
        if (lcaHandle) await lcaHandle.dispose();

        if (currentCommonPathLength <= 2) {
            await buttonCandidate.dispose();
            continue;
        }

        if (buttonBox.y < sectionTitleBox.y - 20) {
            await buttonCandidate.dispose();
            continue;
        }
        if (Math.abs(buttonBox.y - sectionTitleBox.y) < sectionTitleBox.height && buttonBox.x < sectionTitleBox.x) {
            await buttonCandidate.dispose();
            continue;
        }

        const buttonCenterX = buttonBox.x + buttonBox.width / 2;
        const buttonCenterY = buttonBox.y + buttonBox.height / 2;
        const distance = Math.sqrt(
            Math.pow(buttonCenterX - sectionTitleCenterX, 2) +
            Math.pow(buttonCenterY - sectionTitleCenterY, 2)
        );

        if (currentCommonPathLength > maxCommonPathLength) {
            if (bestAddButton) await bestAddButton.dispose();
            maxCommonPathLength = currentCommonPathLength;
            bestAddButton = buttonCandidate;
            minDistance = distance;
        } else if (currentCommonPathLength === maxCommonPathLength) {
            if (distance < minDistance) {
                if (bestAddButton) await bestAddButton.dispose();
                minDistance = distance;
                bestAddButton = buttonCandidate;
            } else {
                await buttonCandidate.dispose();
            }
        } else {
            await buttonCandidate.dispose();
        }
    }

    if (bestAddButton) {
        const buttonText = await page.evaluate(el => el.innerText || el.textContent || '', bestAddButton);
        console.log(`[点击按钮] 确定点击最佳“添加”按钮："${buttonText.trim().substring(0, 50)}..." (共同路径长: ${maxCommonPathLength}, 距离: ${minDistance.toFixed(2)})`);

        const box = await bestAddButton.boundingBox();
        if (box) {
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            console.log('[点击按钮] 成功点击最佳“添加”按钮。');
            await new Promise(r => setTimeout(r, delay));
            return bestAddButton;
        }
    }
    console.error('[点击按钮] 未能找到并点击合适的“添加”按钮。');
    return null;
}

/**
 * 确定新弹出的表单容器。此函数在此新策略下变为可选，可以不直接使用，
 * 但仍可能用于验证整体页面布局。为了通用性，我将保留它，但其重要性会降低。
 * @param {import('puppeteer').Page} page Puppeteer 页面对象。
 * @param {string} firstFieldLabel 第一个预期表单字段的标签文本（例如 '项目名称' 或 '公司名称'），用于验证容器。
 * @param {number} timeout 等待超时时间（毫秒）。
 * @param {number} delay 每次检查后的延迟。
 * @param {import('puppeteer').ElementHandle|null} [addButtonHandle=null] 触发表单弹出的“添加”按钮的句柄，用于辅助定位新出现的容器。
 * @returns {Promise<import('puppeteer').ElementHandle|null>} 找到的表单容器句柄，如果失败则为 null。
 */
async function determineFormContainer(page, firstFieldLabel, timeout = 5000, delay = 500, addButtonHandle = null) {
    console.log(`[表单识别] 尝试识别新表单容器，预期包含字段：“${firstFieldLabel}”...`);

    const potentialFormSelectors = [
        '[role="dialog"]',
        '.ant-modal-content',
        '.el-dialog',
        'form',
        '[class*="form-modal"]',
        '[class*="modal-dialog"]',
        '[class*="drawer-content"]',
        'body > div[id][style*="display: block"]',
        'div[tabindex="-1"]',
        'div', // 最通用的 div
    ];

    const startTime = Date.now();
    let initialDomSnapshot = new Set();

    if (addButtonHandle) {
        try {
            const allElements = await page.$$('*');
            for (const el of allElements) {
                const xpath = await getXPathForElement(el);
                if (xpath && xpath !== 'N/A (null/undefined element)') {
                    initialDomSnapshot.add(xpath);
                }
                await el.dispose();
            }
        } catch (e) {
            console.warn(`[表单识别] 无法获取初始DOM快照: ${e.message}`);
        }
    }

    while (Date.now() - startTime < timeout) {
        for (const selector of potentialFormSelectors) {
            const containers = await page.$$(selector);
            for (const container of containers) {
                const box = await container.boundingBox();
                if (!box || box.width === 0 || box.height === 0) {
                    await container.dispose();
                    continue;
                }

                if (selector === 'div' && await container.evaluate(el => el === document.body)) {
                    await container.dispose();
                    continue;
                }

                // 在这个容器内查找第一个预期的字段 (使用新的 findInputFieldByLabel，不再传入容器本身作为上下文，而是整个页面)
                // 这样 findInputFieldByLabel 会自行遍历所有输入框，并与标签元素进行路径和距离匹配
                const fieldElement = await findInputFieldByLabel(page, firstFieldLabel);
                if (fieldElement) {
                    const isBodyChild = await container.evaluate((el) => el.parentNode === document.body);
                    const xpath = await getXPathForElement(container);

                    if (
                        selector !== 'div' ||
                        isBodyChild ||
                        (box.x > 0 && box.y > 0 && box.x + box.width < page.viewport().width && box.y + box.height < page.viewport().height &&
                         box.width > 200 && box.height > 100)
                    ) {
                        if (selector === 'div' && addButtonHandle && initialDomSnapshot.has(xpath)) {
                            await fieldElement.dispose();
                            await container.dispose();
                            continue;
                        }

                        console.log(`[表单识别] 成功识别新表单容器：${xpath}，包含字段“${firstFieldLabel}”。`);
                        await fieldElement.dispose();
                        return container;
                    }
                    await fieldElement.dispose();
                }
                await container.dispose();
            }
        }
        await new Promise(r => setTimeout(r, delay));
    }

    console.error(`[表单识别] 未能在 ${timeout}ms 内识别到包含字段“${firstFieldLabel}”的新表单容器。`);
    return null;
}

/**
 * 搜索页面中与标签文本关联的最近的输入/文本区域。
 * 策略：查找所有可能的标签元素和所有输入框，然后根据 XPath 路径相似度和几何距离进行匹配。
 * 不再强制在特定容器内查找，而是查找整个页面，利用共同祖先路径来判断相关性。
 *
 * @param {import('puppeteer').Page} page Puppeteer 页面对象。
 * @param {string} labelText 输入字段的标签文本（例如，“公司名称”）。
 * @returns {Promise<import('puppeteer').ElementHandle|null>} 找到的输入框或文本区域的 ElementHandle，或 null。
 */
async function findInputFieldByLabel(page, labelText, containerElement = null) {
    console.log(`[查找字段] 正在 ${containerElement ? '容器内' : '全页面'} 查找 "${labelText}" 字段的输入框...`);

    let bestMatchInput = null;
    let maxCommonPathDepth = -1;
    let minDistance = Infinity;
    let bestMatchInputBox = null;

    // 如果提供了容器元素，则在此容器内查找，否则在整个页面查找
    const searchScope = containerElement || page;

    // 1. 查找所有可见的标签文本元素 (包括 span)
    const potentialLabelElements = [];
    const labelSelectors = ['label', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    for (const selector of labelSelectors) {
        const elements = await searchScope.$$(selector); // 在容器内或页面查找
        for (const el of elements) {
            const text = await el.evaluate(node => node.innerText || node.textContent || '');
            if (text.includes(labelText) && text.trim().length <= labelText.length + 20) {
                const box = await el.boundingBox();
                if (box && box.width > 0 && box.height > 0) {
                    potentialLabelElements.push(el);
                } else {
                    await el.dispose();
                }
            } else {
                await el.dispose();
            }
        }
    }

    // 2. 查找所有可见的输入框和文本区域 (在容器内或整个页面)
    const potentialInputElements = [];
    const inputSelectors = ['input:not([type="hidden"])', 'textarea'];
    for (const selector of inputSelectors) {
        const elements = await searchScope.$$(selector); // 在容器内或页面查找
        for (const el of elements) {
            const box = await el.boundingBox();
            if (box && box.width > 0 && box.height > 0) {
                potentialInputElements.push(el);
            } else {
                await el.dispose();
            }
        }
    }

    // 优先级1: 如果没有找到标签元素，尝试通过 placeholder 查找 (高优先级)
    if (potentialLabelElements.length === 0) {
        console.log(`[查找字段] 在 ${containerElement ? '容器内' : '全页面'} 未找到标签文本 "${labelText}"，尝试通过 placeholder 查找...`);
        // 这里也需要考虑在容器内查找
        const placeholderSelector = `input[placeholder*="${labelText}" i], textarea[placeholder*="${labelText}" i]`;
        const inputWithPlaceholder = await (containerElement ? containerElement.$(placeholderSelector) : page.$(placeholderSelector));

        if (inputWithPlaceholder) {
            const box = await inputWithPlaceholder.boundingBox();
            if (box && box.width > 0 && box.height > 0) {
                console.log(`[查找字段] 通过 placeholder 在 ${containerElement ? '容器内' : '全页面'} 找到输入框：${await getXPathForElement(inputWithPlaceholder)}`);
                // 释放所有之前获取的句柄
                potentialLabelElements.forEach(h => h.dispose());
                potentialInputElements.forEach(h => h.dispose());
                return inputWithPlaceholder;
            }
            await inputWithPlaceholder.dispose();
        }
        // 如果是在容器内查找，但没找到，可以不用打印错误，因为可能这个字段不在当前容器
        if (!containerElement) {
             console.error(`[查找字段] 未能在页面中找到 "${labelText}" 关联的输入框。`);
        }
        return null;
    }

    // 优先级2: 遍历标签元素和输入框，根据共同祖先路径和几何距离匹配
    for (const labelEl of potentialLabelElements) {
        const labelBox = await labelEl.boundingBox();
        if (!labelBox) {
            continue;
        }
        const labelCenterX = labelBox.x + labelBox.width / 2;
        const labelCenterY = labelBox.y + labelBox.height / 2;

        for (const inputEl of potentialInputElements) {
            const inputBox = await inputEl.boundingBox();
            if (!inputBox) {
                continue;
            }
            const inputCenterX = inputBox.x + inputBox.width / 2;
            const inputCenterY = inputBox.y + inputBox.height / 2;

            // 优先检查 label 的 'for' 属性
            const labelForAttr = await labelEl.evaluate(el => el.tagName === 'LABEL' ? el.getAttribute('for') : null);
            if (labelForAttr) {
                const inputId = await inputEl.evaluate(el => el.id);
                if (labelForAttr === inputId) {
                    console.log(`[查找字段] 通过 label 'for' 属性匹配到输入框：${await getXPathForElement(inputEl)}`);
                    // 找到完美匹配，释放所有其他句柄并返回
                    potentialLabelElements.forEach(h => h !== labelEl ? h.dispose() : null);
                    potentialInputElements.forEach(h => h !== inputEl ? h.dispose() : null);
                    return inputEl;
                }
            }

            // 计算最近公共祖先的深度 (路径相似度)
            const lcaHandle = await getLowestCommonAncestor(page, labelEl, inputEl);
            const currentCommonPathDepth = lcaHandle ? await getElementDepth(lcaHandle) : 0;
            if (lcaHandle) await lcaHandle.dispose();

            // 只有当 LCA 在容器内部时才考虑，如果提供了容器
            if (containerElement && !(await containerElement.evaluate((container, el) => container.contains(el), containerElement, lcaHandle || labelEl))) {
                // 如果LCA不在容器内，或者标签本身不在容器内，则跳过
                continue;
            }


            // 计算几何距离
            const distance = Math.sqrt(
                Math.pow(inputCenterX - labelCenterX, 2) +
                Math.pow(inputCenterY - labelCenterY, 2)
            );

            // 过滤：输入框不能在标签的上方太远（通常输入框在标签的右边或下方）
            if (inputBox.bottom < labelBox.top - 10) {
                continue;
            }

            // --- 核心优化：偏向于选择第一个输入框 ---
            // 选择共同路径最长，距离最近的按钮
            if (currentCommonPathDepth > maxCommonPathDepth) {
                maxCommonPathDepth = currentCommonPathDepth;
                minDistance = distance;
                bestMatchInput = inputEl;
                bestMatchInputBox = inputBox; // 存储 boundingBox
            } else if (currentCommonPathDepth === maxCommonPathDepth) {
                if (distance < minDistance) {
                    minDistance = distance;
                    bestMatchInput = inputEl;
                    bestMatchInputBox = inputBox; // 存储 boundingBox
                } else if (distance === minDistance) {
                    // 如果共同路径和距离都相同，选择 X 坐标最小的（最靠左的）
                    // 这对于复合字段（如“年”和“月”）通常能选到第一个
                    if (bestMatchInputBox && inputBox.x < bestMatchInputBox.x) {
                        bestMatchInput = inputEl;
                        bestMatchInputBox = inputBox;
                    }
                }
            }
        }
    }

    // 释放所有临时句柄
    potentialLabelElements.forEach(h => h.dispose());
    potentialInputElements.forEach(h => h !== bestMatchInput ? h.dispose() : null);

    if (bestMatchInput) {
        const box = await bestMatchInput.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
            console.log(`[查找字段] 找到 "${labelText}" 关联输入框：${await getXPathForElement(bestMatchInput)} (LCA 深度: ${maxCommonPathDepth}, 距离: ${minDistance.toFixed(2)})`);
            return bestMatchInput;
        }
    }

    if (!containerElement) { // 只有在全页面查找时才报错
        console.error(`[查找字段] 未能在页面中找到 "${labelText}" 关联的输入框。`);
    }
    return null;
}

/**
 * 填写指定的输入框/文本区域，并模拟人工操作。
 * @param {import('puppeteer').Page} page Puppeteer 页面对象。
 * @param {import('puppeteer').ElementHandle} inputElement 要填写的输入框元素句柄。
 * @param {string} value 要输入的值。
 * @param {number} delay 每次主要操作后的延迟（毫秒）。
 * @returns {Promise<boolean>} 如果填写成功则为 true，否则为 false。
 */
async function fillInputField(page, inputElement, value, delay = 200) {
    if (!inputElement) {
        console.error('[填写字段] 无效的输入框元素。');
        return false;
    }

    const box = await inputElement.boundingBox();
    if (!box || box.width === 0 || box.height === 0) {
        console.error(`[填写字段] 目标输入框 (${await getXPathForElement(inputElement)}) 不可见或无 boundingBox。`);
        return false;
    }

    console.log(`[填写字段] 正在填写输入框：${await getXPathForElement(inputElement)}，值："${value}"`);
    await new Promise(r => setTimeout(r, delay));

    try {
        await inputElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, delay / 2));
        await inputElement.click();
        console.log(`[填写字段] 已滚动到视图并点击输入框以获取焦点。`);
    } catch (e) {
        console.warn(`[填写字段] 无法滚动或点击输入框 (${await getXPathForElement(inputElement)})：${e.message}`);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await new Promise(r => setTimeout(r, delay / 2));
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        console.log(`[填写字段] 已使用鼠标点击输入框。`);
    }

    await new Promise(r => setTimeout(r, delay));

    const currentInputValue = await inputElement.evaluate(el => el.value || el.innerText || el.textContent);
    if (currentInputValue && currentInputValue.length > 0) {
        const isMac = process.platform === 'darwin';
        await page.keyboard.down(isMac ? 'Meta' : 'Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up(isMac ? 'Meta' : 'Control');
        await new Promise(r => setTimeout(r, delay / 2));
        await page.keyboard.press('Backspace');
        console.log(`[填写字段] 已清空现有内容。`);
        await new Promise(r => setTimeout(r, delay));
    }

    await inputElement.type(value);
    console.log(`[填写字段] 已输入新内容: "${value}"。`);
    await new Promise(r => setTimeout(r, delay));

    await page.keyboard.press('Enter');
    console.log('[填写字段] 已按 Enter 键确认输入框。');
    await new Promise(r => setTimeout(r, delay));

    await page.keyboard.press('Tab');
    console.log('[填写字段] 已按 Tab 键离开输入框。');
    await new Promise(r => setTimeout(r, delay));

    return true;
}

function modifyText(text) {
    if (text.endsWith('，')) return text.slice(0, -1) + '。'
    if (text.endsWith('。')) return text.slice(0, -1) + '，'
    return text + '。'
}

// --- 导出所有辅助函数 ---
module.exports = {
    getXPathForElement,
    getElementDepth,
    getLowestCommonAncestor,
    getAllClickableElementsWithKeywords,
    findSectionTitle,
    findAddButtonAndClick,
    determineFormContainer,
    findInputFieldByLabel,
    fillInputField,
    modifyText,
    selectDropdownOption
};