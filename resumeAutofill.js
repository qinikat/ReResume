// 从 resumeActions.js 导入所有需要的函数
const {
    findSectionTitle,
    findAddButtonAndClick,
    // determineFormContainer, // 在新策略下，可能不再直接需要这个导出，但保留也无妨
    findInputFieldByLabel,
    fillInputField,
    // 如果你在autofillResume中直接使用了其他辅助函数（如getXPathForElement），也需要在这里导入
    // getXPathForElement,
} = require('./resumeActions'); // 确保路径正确

/**
 * 尝试填写一个表单字段。
 * @param {import('puppeteer').Page} page Puppeteer 页面对象。
 * @param {string} labelText 字段的标签文本。
 * @param {string} value 要填入的值。
 * @param {number} delay 填写操作后的延迟。
 * @returns {Promise<boolean>} 如果字段成功找到并填写则返回 true，否则返回 false。
 */
async function attemptFillField(page, labelText, value, delay) { // 移除 formContainerElement 参数
    console.log(`[字段填写] 尝试填写"${labelText}"字段...`); // 日志也相应修改
    // findInputFieldByLabel 现在是全局查找，不再需要上下文
    const inputElement = await findInputFieldByLabel(page, labelText);
    if (!inputElement) {
        console.warn(`[字段填写] 未找到"${labelText}"输入框，跳过此字段。`);
        return false;
    }

    const filled = await fillInputField(page, inputElement, value, delay);
    await inputElement.dispose(); // 及时释放句柄

    if (!filled) {
        console.warn(`[字段填写] 未能成功填写"${labelText}"。`);
        return false;
    }
    console.log(`[字段填写] 成功填写"${labelText}"。`);
    return true;
}


/**
 * 封装填充“项目经历”的完整流程。
 * @param {import('puppeteer').Page} page Puppeteer 页面对象。
 * @param {number} delay 通用操作延迟。
 * @returns {Promise<boolean>} 如果项目经历模块主要步骤成功则返回 true，否则返回 false。
 */
async function fillProjectExperience(page, delay) {
    console.log('\n--- 开始填充项目经历 ---');
    // 1. 找到“项目经历”标题
    const projectSectionTitle = await findSectionTitle(page, '项目经历', delay);
    if (!projectSectionTitle) {
        console.error('[项目经历] 未找到项目经历区域标题，跳过此模块。');
        return false;
    }

    // 2. 找到并点击“添加项目”按钮
    const addProjectButton = await findAddButtonAndClick(page, projectSectionTitle, ['添加项目', '添加'], delay);
    if (!addProjectButton) {
        console.error('[项目经历] 未能点击“添加项目”按钮，跳过此模块。');
        await projectSectionTitle.dispose(); // 释放标题句柄
        return false;
    }

    // **重要改变：不再需要 determineFormContainer 返回的容器来查找字段**
    // 理论上，点击添加按钮后，表单就会出现，findInputFieldByLabel 可以直接查找
    // 但为了确保表单加载完成，我们仍然需要一个等待机制。这里可以简单地等待一段时间，
    // 或者用一个轻量级的判断来替代 determineFormContainer 的复杂逻辑。
    // 例如，简单等待一下，让表单元素加载出来
    await new Promise(r => setTimeout(r, delay * 2)); // 额外等待，确保表单元素已加载

    await addProjectButton.dispose(); // 按钮点击后即可释放
    await projectSectionTitle.dispose(); // 标题句柄也已完成使命，释放

    console.log('[项目经历] 假设新项目表单已出现，开始填写字段。');

    // 4. 尝试填写各项字段，直接在页面上查找
    // 注意：这里的 attemptFillField 调用不再需要 projectFormContainer
    await attemptFillField(page, '项目名称', '智能简历助手开发', delay / 2);
    await attemptFillField(page, '项目角色', '核心开发者', delay / 2);
    await attemptFillField(page, '描述', '负责前端界面与后端数据交互逻辑，实现了简历内容的自动化填写与管理功能。参与技术选型，负责核心模块设计与编码。', delay / 2);

    // TODO: 考虑添加点击“保存”或“确定”按钮的逻辑

    console.log('--- 项目经历填充结束 ---\n');
    return true;
}



/**
 * 封装填充“实习经历”的完整流程。
 * @param {import('puppeteer').Page} page Puppeteer 页面对象。
 * @param {number} delay 通用操作延迟。
 * @returns {Promise<boolean>} 如果实习经历模块主要步骤成功则返回 true，否则返回 false。
 */
async function fillInternshipExperience(page, delay) {
    console.log('\n--- 开始填充实习经历 ---');
    // 1. 找到“实习经历”标题
    const internshipSectionTitle = await findSectionTitle(page, '实习经历', delay);
    if (!internshipSectionTitle) {
        console.error('[实习经历] 未找到实习经历区域标题，跳过此模块。');
        return false;
    }

    // 2. 找到并点击“添加实习”按钮
    const addInternshipButton = await findAddButtonAndClick(page, internshipSectionTitle, ['添加实习', '添加'], delay);
    if (!addInternshipButton) {
        console.error('[实习经历] 未能点击“添加实习”按钮，跳过此模块。');
        await internshipSectionTitle.dispose(); // 释放标题句柄
        return false;
    }

    // 额外等待，确保表单元素已加载
    await new Promise(r => setTimeout(r, delay * 2));

    await addInternshipButton.dispose(); // 按钮点击后即可释放
    await internshipSectionTitle.dispose(); // 标题句柄也已完成使命，释放

    console.log('[实习经历] 假设新实习表单已出现，开始填写字段。');

    // 4. 尝试填写各项字段，直接在页面上查找
    // 注意：这里的 attemptFillField 调用不再需要 internshipFormContainer
    await attemptFillField(page, '公司名称', '未来科技有限责任公司', delay / 2);
    await attemptFillField(page, '职位名称', '软件开发实习生', delay / 2);
    await attemptFillField(page, '描述', '参与公司内部项目开发，学习并实践了敏捷开发流程，负责前端模块的开发与单元测试。', delay / 2);

    // TODO: 考虑添加点击“保存”或“确定”按钮的逻辑

    console.log('--- 实习经历填充结束 ---\n');
    return true;
}


/**
 * 自动化填写简历的整体流程。
 * @param {import('puppeteer').Page} page Puppeteer 页面对象。
 * @returns {Promise<boolean>} 如果所有主要模块流程都尝试完成则返回 true，否则返回 false（在某个模块的核心操作失败时）。
 */
async function autofillResume(page) {
    console.log('--- 开始自动填写简历流程 ---');
    const delay = 1000; // 通用操作延迟

    // 尝试填充项目经历，即使失败也继续尝试其他模块
    const projectFilled = await fillProjectExperience(page, delay);
    if (!projectFilled) {
        console.warn('[主流程] 项目经历填充遇到问题，但将尝试继续其他模块。');
    }

    // 尝试填充实习经历
    const internshipFilled = await fillInternshipExperience(page, delay);
    if (!internshipFilled) {
        console.warn('[主流程] 实习经历填充遇到问题，但将尝试继续其他模块。');
    }

    console.log('--- 自动填写简历流程完成 ---');
    return true; // 表示整个流程已尝试执行
}

// 暴露接口
module.exports = {
    autofillResume,
};
