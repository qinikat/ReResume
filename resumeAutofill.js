// autofillResume.js

// 导入所有需要的函数
const {
    findSectionTitle,
    findAddButtonAndClick,
    findInputFieldByLabel,
    fillInputField,
} = require('./resumeActions');

const fs = require('fs').promises;
const path = require('path');

/**
 * 尝试填写一个表单字段，支持单个值或多个相邻输入框的复合值。
 *
 * @param {import('puppeteer').Page} page Puppeteer 页面对象。
 * @param {string|string[]} labelTexts 字段的标签文本。可以是单个字符串或字符串数组。
 * @param {string|string[]} value 要填入的值。如果是数组，表示复合字段。
 * @param {number} delay 填写操作后的延迟。
 * @param {import('puppeteer').ElementHandle|null} [containerElement=null] 可选：限制搜索范围的容器元素句柄。
 * @returns {Promise<boolean>} 如果字段成功找到并填写则返回 true，否则返回 false。
 */
async function attemptFillField(page, labelTexts, value, delay, containerElement = null) { // 新增 containerElement
    const labelsToTry = Array.isArray(labelTexts) ? labelTexts : [labelTexts];
    console.log(`[字段填写] 尝试填写标签为："${labelsToTry.join('", "')}" 的字段${containerElement ? '在指定容器内' : ''}...`);

    let inputElement = null;
    let foundLabel = null;

    for (const label of labelsToTry) {
        // *** 核心改变：将 containerElement 传递给 findInputFieldByLabel ***
        inputElement = await findInputFieldByLabel(page, label, containerElement);
        if (inputElement) {
            foundLabel = label;
            console.log(`[字段填写] 找到标签为 "${foundLabel}" 的输入框。`);
            break;
        }
    }

    if (!inputElement) {
        console.warn(`[字段填写] 未找到任何符合提供标签的输入框："${labelsToTry.join('", "')}"，跳过此字段。`);
        return false;
    }

    // 检查 value 是否是数组，如果是，则进行复合字段处理
    const valuesToFill = Array.isArray(value) ? value : [value];

    let currentInputElement = inputElement; // 当前要填充的输入框
    let success = true;

    for (let i = 0; i < valuesToFill.length; i++) {
        const val = valuesToFill[i];
        console.log(`[字段填写] 正在填充 "${foundLabel}" (部分 ${i + 1}/${valuesToFill.length})，值为: "${val}"`);

        // 调用 fillInputField，由其内部处理 Tab/Enter 逻辑
        const filled = await fillInputField(page, currentInputElement, val, delay);

        if (!filled) {
            console.warn(`[字段填写] 未能成功填写 "${foundLabel}" 的第 ${i + 1} 部分。`);
            success = false;
            break; // 某个部分填写失败，则退出
        }

        // 如果还有下一个值要填写，并且这不是最后一个输入框，则尝试找到下一个相邻的输入框
        if (i < valuesToFill.length - 1) {
            // 模拟按下 Tab 键以跳转到下一个相邻的输入框
            // 注意：这里强制按 Tab，因为我们假设复合字段的各个部分之间是通过 Tab 切换的
            console.log(`[字段填写] 模拟按下 Tab 键以跳转到 "${foundLabel}" 的下一个部分。`);
            await page.keyboard.press('Tab');
            await new Promise(r => setTimeout(r, delay / 4)); // 短暂等待确保焦点切换

            // 尝试获取当前焦点所在的元素，或通过其他方式找到下一个相邻输入框
            // 这是一个挑战：Puppeteer 没有直接的 "getNextFocusedElement"
            // 最可靠的方式是再次查找页面中可见的输入框，并结合当前的焦点元素来判断。
            // 简单起见，这里假设 Tab 键会正确移动到下一个相关的输入框。
            // 复杂场景可能需要更精细的逻辑（比如：查找当前 inputElement 的兄弟 input、父元素下的子 input 等）

            // 简单但可能不够健壮的尝试：获取当前页面上所有可见的 input/textarea，并假设下一个就是我们要的
            // **更健壮的方案可能需要根据 DOM 结构查找下一个兄弟 input 或父元素内的下一个 input**
            // 暂时不改动 fillInputField，让它自己判断要不要按Tab，attemptFillField只负责按回车

            // Re-evaluate the current focused element or find the next logical input
            // For now, we'll assume the 'Tab' press moves to the correct next input.
            // If this proves unreliable, we'll need a more sophisticated 'findNextInputField' logic.
            // For complex scenarios, consider using `page.evaluate` to traverse DOM,
            // or finding all inputs within a common parent and picking the next one.
            // Example of a more robust way (might need a helper):
            // currentInputElement = await findNextAdjacentInputField(page, currentInputElement);
            // if (!currentInputElement) {
            //     console.warn(`[字段填写] 未找到 "${foundLabel}" 的下一个相邻输入框，复合字段填写中断。`);
            //     success = false;
            //     break;
            // }

            // 替代方案：如果 fillInputField 已经处理了 Tab/Enter，这里就不再额外处理 Tab
            // 并且我们不再需要显式获取下一个 inputElement，因为 fillInputField 负责了焦点移动。
            // 核心思想是：第一次 fillInputField 填充第一个值，它会按 Tab 跳到第二个框。
            // 第二次 fillInputField 填充第二个值，它会按 Tab 跳到第三个框，以此类推。
            // 所以这里不再需要手动按 Tab 或查找下一个输入框。
        }
    }

    await inputElement.dispose(); // 释放初始找到的元素句柄

    if (!success) {
        console.warn(`[字段填写] 未能完全成功填写标签为 "${foundLabel}" 的复合字段。`);
        return false;
    }
    console.log(`[字段填写] 成功填写标签为 "${foundLabel}" 的复合字段。`);
    return true;
}


/**
 * 封装填充通用模块的流程（个人信息、项目经历、实习经历）。
 * @param {import('puppeteer').Page} page Puppeteer 页面对象。
 * @param {string} moduleName 模块名称 (如 'personalInfo', 'projectExperiences', 'internshipExperiences')。
 * @param {object} moduleData 从 JSON 读取的单个模块/记录的数据 (例如 personalInfo 对象，或 projectExperiences 数组中的一个项目对象)。
 * @param {number} delay 通用操作延迟。
 * @returns {Promise<boolean>} 如果模块主要步骤成功则返回 true，否则返回 false。
 */
/**
 * 封装填充通用模块的流程（个人信息、项目经历、实习经历）。
 * @param {import('puppeteer').Page} page Puppeteer 页面对象。
 * @param {string} moduleName 模块名称 (如 'personalInfo', 'projectExperiences', 'internshipExperiences')。
 * @param {object} moduleData 从 JSON 读取的单个模块/记录的数据 (例如 personalInfo 对象，或 projectExperiences 数组中的一个项目对象)。
 * @param {number} delay 通用操作延迟。
 * @returns {Promise<boolean>} 如果模块主要步骤成功则返回 true，否则返回 false。
 */
async function fillModule(page, moduleName, moduleData, delay) {
    console.log(`\n--- 开始填充 ${moduleName} ---`);

    let formContainer = null; // 新增：用于存储表单容器句柄

    // 对于需要“添加”按钮的模块（如项目经历、实习经历）
    if (moduleData.addButtonLabels && moduleData.addButtonLabels.length > 0) {
        const sectionTitle = await findSectionTitle(page, moduleData.titleLabels, delay);
        if (!sectionTitle) {
            console.error(`[${moduleName}] 未找到"${moduleData.titleLabels.join('/')}"区域标题，跳过此模块。`);
            return false;
        }

        const addRecordButton = await findAddButtonAndClick(page, sectionTitle, moduleData.addButtonLabels, delay);
        if (!addRecordButton) {
            console.error(`[${moduleName}] 未能点击“${moduleData.addButtonLabels.join('/')}”按钮，跳过此模块。`);
            await sectionTitle.dispose();
            return false;
        }

        await new Promise(r => setTimeout(r, delay * 2)); // 等待新表单出现

        // *** 核心改变：确定新出现的表单容器 ***
        if (moduleData.firstFormFieldLabel) { // 假设 JSON 数据中会提供新表单的第一个字段标签
             formContainer = await determineFormContainer(page, moduleData.firstFormFieldLabel, 5000, delay / 2, addRecordButton);
             if (!formContainer) {
                 console.error(`[${moduleName}] 未能识别到新出现的表单容器，无法继续填充。`);
                 await addRecordButton.dispose();
                 await sectionTitle.dispose();
                 return false;
             }
             console.log(`[${moduleName}] 成功识别到新表单容器：${await getXPathForElement(formContainer)}`);
        } else {
             console.warn(`[${moduleName}] 未提供 firstFormFieldLabel，将尝试在全页面查找字段。这可能导致不准确的填充。`);
             // 如果没有提供 firstFormFieldLabel，formContainer 保持为 null
        }

        await addRecordButton.dispose();
        await sectionTitle.dispose();

        console.log(`[${moduleName}] 假设新表单已出现，开始填写字段。`);
    } else { // 对于个人信息等直接填充的模块
        const sectionTitle = await findSectionTitle(page, moduleData.titleLabels, delay);
        if (!sectionTitle) {
            console.warn(`[${moduleName}] 未找到"${moduleData.titleLabels.join('/')}"区域标题，跳过此模块。`);
            return false;
        }
        // 对于非弹窗表单，可以将整个页面的主要内容区域作为 formContainer，或者不设置
        // 这里为了简单，如果不是弹窗，formContainer 仍然为 null，表示全页面查找。
        // 更严谨可以根据 titleElement 的父元素确定
        await sectionTitle.dispose();
        console.log(`[${moduleName}] 假设表单已加载，开始填写字段。`);
    }

    // 遍历并填充所有字段
    for (const field of moduleData.fields) {
        // *** 核心改变：将 formContainer 传递给 attemptFillField ***
        const filled = await attemptFillField(page, field.labelTexts, field.value, delay / 2, formContainer); // 传递 formContainer
        if (!filled && !field.optional) {
            console.warn(`[${moduleName}] 警告：非可选字段 "${field.labelTexts.join('/')}" 未能成功填写。`);
        } else if (!filled && field.optional) {
             console.log(`[${moduleName}] 可选字段 "${field.labelTexts.join('/')}" 未能找到或填写，已跳过。`);
        }
    }

    // 填充完成后，如果存在 formContainer，通常需要点击保存或关闭按钮
    if (formContainer) {
        console.log(`[${moduleName}] 表单填充完毕，正在尝试寻找并点击保存/确定按钮...`);
        // TODO: 在 formContainer 内部查找并点击保存/确定按钮
        // 可以添加一个通用的 findAndClickSaveButton(page, container, delay) 函数
        // 例如：
        const saveButton = await findAddButtonAndClick(page, formContainer, ['保存', '确定', '提交', '完成'], delay);
        if (saveButton) {
            await saveButton.dispose();
            console.log(`[${moduleName}] 成功点击保存/确定按钮。`);
        } else {
            console.warn(`[${moduleName}] 未找到保存/确定按钮，可能需要手动关闭弹窗或确认。`);
            // 尝试模拟按 ESC 关闭弹窗，作为备用方案
            await page.keyboard.press('Escape');
            console.log(`[${moduleName}] 已模拟按下 'Escape' 键。`);
        }
        await formContainer.dispose(); // 释放容器句柄
    }

    console.log(`--- ${moduleName} 填充结束 ---\n`);
    return true;
}


/**
 * 自动化填写简历的整体流程。
 * @param {import('puppeteer').Page} page Puppeteer 页面对象。
 * @returns {Promise<boolean>} 如果所有主要模块流程都尝试完成则返回 true，否则返回 false（如果核心数据加载失败）。
 */
async function autofillResume(page) {
    console.log('--- 开始自动填写简历流程 ---');
    const delay = 1000; // 通用操作延迟

    let resumeData;
    try {
        const jsonPath = path.resolve(__dirname, 'resume.json'); // 确保 resume.json 在与此脚本相同的目录下
        const data = await fs.readFile(jsonPath, 'utf8');
        resumeData = JSON.parse(data);
        console.log('[主流程] 成功加载简历数据。');
    } catch (error) {
        console.error(`[主流程] 读取或解析 resume.json 失败: ${error.message}`);
        return false; // 如果数据加载失败，则整个流程停止
    }

    // 填充个人信息
    if (resumeData.personalInfo && resumeData.personalInfo.fields && resumeData.personalInfo.fields.length > 0) {
        const personalInfoFilled = await fillModule(page, '个人信息', resumeData.personalInfo, delay);
        if (!personalInfoFilled) {
            console.warn('[主流程] 个人信息填充遇到问题，但将尝试继续其他模块。');
        }
    } else {
        console.warn('[主流程] resume.json 中未找到个人信息数据或数据为空，跳过此模块。');
    }

    // 填充项目经历 (遍历数组，每个项目调用一次 fillModule)
    if (resumeData.projectExperiences && resumeData.projectExperiences.length > 0) {
        for (let i = 0; i < resumeData.projectExperiences.length; i++) {
            const project = resumeData.projectExperiences[i];
            console.log(`\n--- 填充第 ${i + 1} 个项目经历 ---`);
            const projectFilled = await fillModule(page, `项目经历 (第 ${i + 1} 个)`, project, delay);
            if (!projectFilled) {
                console.warn(`[主流程] 第 ${i + 1} 个项目经历填充遇到问题，但将尝试继续下一个项目或模块。`);
            }
        }
    } else {
        console.warn('[主流程] resume.json 中未找到项目经历数据或数据为空，跳过此模块。');
    }

    // 填充实习经历 (遍历数组，每个实习调用一次 fillModule)
    if (resumeData.internshipExperiences && resumeData.internshipExperiences.length > 0) {
        for (let i = 0; i < resumeData.internshipExperiences.length; i++) {
            const internship = resumeData.internshipExperiences[i];
            console.log(`\n--- 填充第 ${i + 1} 个实习经历 ---`);
            const internshipFilled = await fillModule(page, `实习经历 (第 ${i + 1} 个)`, internship, delay);
            if (!internshipFilled) {
                console.warn(`[主流程] 第 ${i + 1} 个实习经历填充遇到问题，但将尝试继续下一个实习或模块。`);
            }
        }
    } else {
        console.warn('[主流程] resume.json 中未找到实习经历数据或数据为空，跳过此模块。');
    }

    console.log('--- 自动填写简历流程完成 ---');
    return true;
}

// 暴露接口
module.exports = {
    autofillResume,
};