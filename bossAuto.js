// bossAuto.js
let isBossAutoRunning = false;
const processedJobIds = new Set(); // 用于存储已处理的职位ID
// allJobCardsInView 现在只存储ID和处理状态，不再存储ElementHandle，因为ElementHandle会失效
let allJobCardsInView = []; // { id: string, processed: boolean }
let currentProcessingIndex = 0; // 当前正在处理的卡片在 allJobCardsInView 数组中的索引

let consecutiveUlNotFoundCount = 0; // 连续未找到 ul 的次数
const MAX_UL_NOT_FOUND_RETRIES = 3; // 最大连续未找到 ul 的重试次数，超过则尝试返回上一页

let consecutiveApplicationErrors = 0; // 新增：连续投递操作中遇到的错误次数
const MAX_CONSECUTIVE_APPLICATION_ERRORS = 3; // 新增：最大连续投递错误次数，超过则刷新页面

/**
 * 暂停指定毫秒数
 * @param {number} ms 毫秒
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 检查元素是否存在并可点击
 * @param {import('puppeteer').Page} page Puppeteer 页面对象
 * @param {string} selector CSS 选择器
 * @param {number} timeout 等待超时时间（毫秒）
 * @returns {Promise<import('puppeteer').ElementHandle | null>} 如果元素存在且可见则返回 ElementHandle，否则返回 null
 */
async function getVisibleElement(page, selector, timeout = 5000) {
    try {
        const element = await page.waitForSelector(selector, { visible: true, timeout: timeout });
        console.log(`[getVisibleElement] 元素 '${selector}' 已找到并可见。`);
        return element;
    } catch (e) {
        console.log(`[getVisibleElement] 元素 '${selector}' 未找到、不可见或超时: ${e.message}`);
        return null;
    }
}

/**
 * 从公司卡片中提取职位ID
 * @param {import('puppeteer').ElementHandle} cardElement 公司卡片的ElementHandle
 * @returns {Promise<string|null>} 职位ID或null
*/
async function getJobIdFromCard(cardElement) {
    try {
        const jobLink = await cardElement.$('a[href*="/job_detail/"]');
        if (jobLink) {
            const href = await jobLink.evaluate(node => node.href);
            const match = href.match(/\/job_detail\/([a-zA-Z0-9]+)\.html/);
            if (match && match[1]) {
                return match[1];
            }
        }
        const jobIdAttr = await cardElement.evaluate(node => node.getAttribute('data-job-id'));
        if (jobIdAttr) {
            return jobIdAttr;
        }
    } catch (e) {
        // console.warn(`[BossAuto] 无法从卡片中提取职位ID: ${e.message}`);
    }
    return `temp_id_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}


/**
 * 执行一次投递操作，尝试处理当前视图中的所有未处理卡片
 * @param {import('puppeteer').Page} page Puppeteer 页面对象
 * @returns {Promise<string>} 返回 'processed' 表示成功处理卡片或刷新列表，'no_more_cards' 表示无卡片可处理，
 * 'go_back' 表示需要返回上一页，'refresh_page' 表示需要刷新当前页面
 */
async function performApplication(page) {
    if (!isBossAutoRunning) {
        console.log('[BossAuto] 投递已停止。');
        return 'no_more_cards';
    }

    console.log('[BossAuto] 开始获取公司卡片列表...');

    const scrollContainerSelector = 'ul.rec-job-list';
    const scrollContainer = await getVisibleElement(page, scrollContainerSelector, 8000);

    if (!scrollContainer) {
        console.error('[BossAuto] 未找到职位列表滚动容器 (ul.rec-job-list)，可能页面已跳转或刷新。');
        consecutiveUlNotFoundCount++;
        if (consecutiveUlNotFoundCount >= MAX_UL_NOT_FOUND_RETRIES) {
            console.warn(`[BossAuto] 连续 ${consecutiveUlNotFoundCount} 次未找到 ul.rec-job-list，尝试返回上一页。`);
            consecutiveUlNotFoundCount = 0; // 重置计数器
            allJobCardsInView = []; // 清空列表
            currentProcessingIndex = 0;
            return 'go_back';
        } else {
            console.log(`[BossAuto] ul.rec-job-list 未找到，第 ${consecutiveUlNotFoundCount} 次重试，等待后再次尝试...`);
            await sleep(3000); // 短暂等待后重试，给页面加载时间
            return 'processed'; // 视为一次尝试，继续外部循环
        }
    }

    // 如果成功找到 ul 容器，重置计数器
    consecutiveUlNotFoundCount = 0;

    let currentVisibleCardElements = await scrollContainer.$$('div.card-area');
    console.log(`[BossAuto] 当前页面可见 ${currentVisibleCardElements.length} 张卡片。`);

    // 重新构建 allJobCardsInView 列表，只添加新的或未处理的ID
    // 每次获取到新的可见卡片元素时，都应该重新更新 allJobCardsInView
    let newFullCardList = [];
    let newCardsDiscovered = false;
    for (let i = 0; i < currentVisibleCardElements.length; i++) {
        const cardElement = currentVisibleCardElements[i];
        const jobId = await getJobIdFromCard(cardElement);

        // 检查这个 jobId 是否已经在 processedJobIds 中
        if (processedJobIds.has(jobId)) {
            // 已处理过的，直接跳过
            newFullCardList.push({ id: jobId, processed: true });
        } else {
            // 未处理过的，检查是否已经在 allJobCardsInView 中 (基于ID)
            const existingCardInQueue = allJobCardsInView.find(item => item.id === jobId);
            if (existingCardInQueue) {
                // 已在队列中，保留其状态
                newFullCardList.push(existingCardInQueue);
            } else {
                // 全新的未处理卡片
                newFullCardList.push({ id: jobId, processed: false });
                newCardsDiscovered = true;
            }
        }
    }

    // 更新全局的卡片列表
    allJobCardsInView = newFullCardList;
    console.log(`[BossAuto] 更新后，队列中共有 ${allJobCardsInView.length} 张卡片（包含已处理和未处理）。`);

    // 筛选出尚未处理的卡片，从当前索引开始，并确保元素在当前DOM中是可点击的
    const actionableCards = [];
    for(let i = currentProcessingIndex; i < allJobCardsInView.length; i++) {
        const cardData = allJobCardsInView[i];
        if (!cardData.processed) {
            // 尝试重新获取ElementHandle，确保它属于当前DOM
            const selector = `ul.rec-job-list > div.card-area:nth-child(${i + 1})`; // 使用nth-child重新定位
            const elementHandle = await getVisibleElement(page, selector, 1000); // 短暂等待
            if (elementHandle) {
                actionableCards.push({ data: cardData, element: elementHandle, indexInDOM: i });
            } else {
                console.warn(`[BossAuto] 警告: 索引 ${i} 的卡片 (${cardData.id || '未知'}) 在当前DOM中不可用，可能已失效或被移除。标记为已处理。`);
                cardData.processed = true; // 标记为已处理，避免再次尝试
            }
        }
    }
    
    console.log(`[BossAuto] 当前可操作的未处理卡片数量: ${actionableCards.length}`);


    // 如果没有可操作的卡片了，或者我们已经处理完所有已知的卡片，尝试滚动
    if (actionableCards.length === 0) {
        console.log('[BossAuto] 没有新的可操作卡片了。尝试滚动列表...');
        const prevScrollTop = await scrollContainer.evaluate(el => el.scrollTop);
        await scrollContainer.evaluate(el => {
            el.scrollTop += el.clientHeight * 0.8; // 向上滚动80%的高度
        });
        await sleep(3000); // 等待新内容加载

        const newScrollTop = await scrollContainer.evaluate(el => el.scrollTop);
        if (newScrollTop === prevScrollTop) {
            console.log('[BossAuto] 滚动后滚动位置没有变化，可能已到达列表底部或没有更多符合条件的职位。');
            allJobCardsInView = []; // 清空列表，下次从头开始发现
            currentProcessingIndex = 0; // 重置索引
            return 'no_more_cards'; // 无法滚动，视作没有新内容
        } else {
            console.log('[BossAuto] 成功滚动，刷新卡片列表。');
            // 滚动后，重置索引和列表，确保从头扫描新加载的卡片
            allJobCardsInView = [];
            currentProcessingIndex = 0;
            // 成功滚动，表示可能还有更多卡片，返回 processed 触发外部循环再次调用 performApplication
            return 'processed';
        }
    }

    // 处理第一张可操作的卡片
    const { data: cardData, element: cardElementToClick, indexInDOM } = actionableCards[0];
    const currentJobId = cardData.id;
    
    // 更新 currentProcessingIndex 到将要处理的这张卡片的实际索引
    currentProcessingIndex = indexInDOM;

    console.log(`[BossAuto] 准备处理卡片 (序号: ${currentProcessingIndex + 1}, ID: ${currentJobId || '未知'})`);

    try {
        // 确保卡片在视口内，并点击它以触发右侧详情加载
        await cardElementToClick.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await sleep(1000); // 等待滚动完成
        
        console.log('[BossAuto] 点击公司卡片以加载右侧详情和“立即沟通”按钮...');
        await cardElementToClick.click(); // 使用重新获取的 ElementHandle
        await sleep(2500); // 增加等待时间，确保右侧详情完全加载

        const chatButtonSelector = 'a.op-btn.op-btn-chat';
        const targetChatButton = await getVisibleElement(page, chatButtonSelector, 5000);

        let success = false;
        if (targetChatButton) {
            console.log('[BossAuto] 找到并点击“立即沟通”按钮...');
            await targetChatButton.click();
            await sleep(2000); // 等待消息框弹出

            const stayButtonSelector = 'a.default-btn.cancel-btn';
            const stayButton = await getVisibleElement(page, stayButtonSelector, 5000);

            if (stayButton) {
                console.log('[BossAuto] 找到“留在此页”按钮，点击完成投递！');
                await stayButton.click();
                await sleep(1500); // 等待弹窗消失
                console.log(`[BossAuto] 投递成功！(ID: ${currentJobId || '未知'})`);
                success = true;
            } else {
                console.log('[BossAuto] 未找到“留在此页”按钮。尝试关闭可能弹出的聊天框。');
                const closeChatButton = await getVisibleElement(page, '.chat-dialog-close', 1500);
                if (closeChatButton) {
                    await closeChatButton.click();
                    await sleep(500);
                    console.log('[BossAuto] 已尝试关闭聊天窗口。');
                } else {
                    console.log('[BossAuto] 未找到聊天窗口关闭按钮。');
                }
            }
        } else {
            console.log('[BossAuto] 页面中未找到“立即沟通”按钮 (a.op-btn.op-btn-chat)。这可能意味着按钮不存在或加载失败。跳过此卡片。');
        }

        if (currentJobId) {
            processedJobIds.add(currentJobId); // 记录已处理的ID，无论成功失败
        }
        allJobCardsInView[currentProcessingIndex].processed = true; // 标记为已处理
        currentProcessingIndex++; // 移动到下一个卡片

        // 投递操作结束后，尝试关闭职位详情侧栏
        const closeDetailButton = await getVisibleElement(page, '.detail-panel-close-btn', 1500);
        if (closeDetailButton) {
            await closeDetailButton.click();
            await sleep(500);
            console.log('[BossAuto] 已尝试关闭职位详情侧栏。');
        }

        consecutiveApplicationErrors = 0; // 成功处理，重置错误计数
        return 'processed';

    } catch (error) {
        console.error(`[BossAuto] 投递过程中发生错误 (卡片序号: ${currentProcessingIndex + 1}, ID: ${currentJobId || '未知'}): ${error.message}`);
        consecutiveApplicationErrors++; // 递增错误计数

        // 错误处理，尝试关闭弹窗/侧栏
        const closeChatButton = await getVisibleElement(page, '.chat-dialog-close', 1500);
        if (closeChatButton) {
            await closeChatButton.click();
            await sleep(500);
            console.log('[BossAuto] 已尝试关闭聊天窗口。');
        }
        const closeDetailButton = await getVisibleElement(page, '.detail-panel-close-btn', 1500);
        if (closeDetailButton) {
            await closeDetailButton.click();
            await sleep(500);
            console.log('[BossAuto] 已尝试关闭职位详情侧栏。');
        }

        if (currentJobId) {
            processedJobIds.add(currentJobId); // 即使失败也标记为已处理，避免无限重试
        }
        allJobCardsInView[currentProcessingIndex].processed = true; // 标记为已处理
        currentProcessingIndex++; // 移动到下一个卡片

        if (consecutiveApplicationErrors >= MAX_CONSECUTIVE_APPLICATION_ERRORS) {
            console.warn(`[BossAuto] 连续 ${consecutiveApplicationErrors} 次投递操作失败，尝试刷新页面。`);
            consecutiveApplicationErrors = 0; // 重置计数器
            return 'refresh_page';
        }

        return 'processed'; // 即使失败，也表示尝试处理了一张卡片，可以继续处理下一张
    }
}

/**
 * 开始Boss直聘自动投递 (单线程阻塞模式)
 * @param {import('puppeteer').Page} page Puppeteer 页面对象
 */
async function bstart(page) {
    if (isBossAutoRunning) {
        console.log('[BossAuto] 自动投递已在运行中。');
        return;
    }
    isBossAutoRunning = true;
    currentProcessingIndex = 0; // 启动时重置索引
    allJobCardsInView = []; // 启动时清空列表
    consecutiveUlNotFoundCount = 0; // 启动时重置 ul 未找到计数器
    consecutiveApplicationErrors = 0; // 启动时重置应用错误计数器
    console.log('[BossAuto] 自动投递已启动！将按顺序处理职位。');

    while (isBossAutoRunning) {
        const applicationResult = await performApplication(page);
        
        if (applicationResult === 'go_back') {
            console.log('[BossAuto] 收到返回上一页指令...');
            try {
                await page.goBack({ waitUntil: 'domcontentloaded' });
                console.log('[BossAuto] 已返回上一页，等待5秒后重新开始查找卡片。');
                await sleep(5000);
                // 返回上一页后，需要清空状态，从头开始发现卡片
                allJobCardsInView = [];
                currentProcessingIndex = 0;
                consecutiveApplicationErrors = 0; // 重置应用错误计数
            } catch (e) {
                console.error(`[BossAuto] 返回上一页失败: ${e.message}。可能已是第一页或浏览器历史记录问题，停止自动投递。`);
                bstop();
            }
        } else if (applicationResult === 'refresh_page') {
            console.log('[BossAuto] 收到刷新页面指令...');
            try {
                await page.reload({ waitUntil: 'domcontentloaded' }); // 刷新页面
                console.log('[BossAuto] 页面已刷新，等待5秒后重新开始查找卡片。');
                await sleep(5000);
                // 刷新页面后，所有旧的 ElementHandle 都失效，需要清空状态，从头开始发现卡片
                allJobCardsInView = [];
                currentProcessingIndex = 0;
                consecutiveApplicationErrors = 0; // 重置应用错误计数
            } catch (e) {
                console.error(`[BossAuto] 刷新页面失败: ${e.message}。停止自动投递。`);
                bstop();
            }
        } else if (applicationResult === 'no_more_cards') {
            console.log('[BossAuto] 当前轮次未找到新的可投递卡片或已达列表底部，等待5秒后重试...');
            await sleep(5000);
            // 此时 allJobCardsInView 和 currentProcessingIndex 已经在 performApplication 内部重置
            // 这里只需要等待，然后进行下一次 performApplication 调用
            consecutiveApplicationErrors = 0; // 无卡片可投递不视为错误，重置错误计数
        } else { // applicationResult === 'processed'
            console.log('[BossAuto] 成功处理一张卡片或刷新卡片列表。继续处理下一个...');
            await sleep(1000); // 每次处理完一张卡片后短暂等待
            // consecutiveApplicationErrors 已经在 performApplication 内部成功时重置
        }
    }
    console.log('[BossAuto] 自动投递已完全停止。');
}

/**
 * 停止Boss直聘自动投递
 */
function bstop() {
    if (!isBossAutoRunning) {
        console.log('[BossAuto] 自动投递当前未运行。');
        return;
    }
    isBossAutoRunning = false;
    currentProcessingIndex = 0; // 停止时重置索引和列表
    allJobCardsInView = [];
    processedJobIds.clear(); // 停止时清空已处理ID，方便下次重新运行
    consecutiveUlNotFoundCount = 0;
    consecutiveApplicationErrors = 0;
    console.log('[BossAuto] 自动投递停止指令已发出，当前操作完成后将完全停止。');
}

module.exports = {
    bstart,
    bstop,
};
