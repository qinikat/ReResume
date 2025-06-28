const puppeteer = require('puppeteer')
const fs = require('fs')
const readline = require('readline')
const path = require('path')
const cron = require('node-cron') // ✅ 引入定时任务模块
const resumeEditor = require('./resumeEditor')
const resumeAutofill = require('./resumeAutofill') // ✅ 引入新的自动填充模块
const bossAuto = require('./bossAuto'); // 引入 bossAuto.js

// 读取配置文件
const configPath = path.join(__dirname, 'config.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
const urls = config.urls || []
const refreshTime = config.refreshTime || '* * * * *'
const editTime = config.editTime || '* * * * *'
const chromePath = config.chromePath

let browser
let openedTabs = new Map() // ✅ 用于记录已打开的标签页（URL -> page）
let currentPage; // 用于存储当前活跃的页面，以便bstart和bstop使用

// 启动浏览器
async function launchBrowser() {
  browser = await puppeteer.launch({
    headless: false,
    executablePath: chromePath, // 替换为你的 Chrome 路径
    userDataDir: path.join(__dirname, 'my-user-data'), // 持久化登录状态
    defaultViewport: {
      width: 1920,
      height: 1080,
    },
    args: ['--window-size=1920,1080'],
  })

  const allPages = await browser.pages()
  const initialPage = allPages.length ? allPages[0] : await browser.newPage()

  // 初始化打开页面
  for (let url of urls) {
    const page = await browser.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    openedTabs.set(url, page)
    console.log(`[初始化打开] ${url}`)
  }
}

// 刷新未打开页面
async function refreshOrOpenPages() {
  const targets = browser.targets()
  const openUrls = targets.map((t) => t.url()).filter(Boolean)

  for (let url of urls) {
    if (!openUrls.includes(url)) {
      const page = await browser.newPage()
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      openedTabs.set(url, page)
      console.log(`[打开] ${url}`)
    } else {
      console.log(`[已打开] ${url}`)
    }
  }
}

// 命令行交互
async function startCommandInterface() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    console.log('----------------------------------------------------');
    console.log('欢迎使用自动化脚本！');
    console.log('可用命令：');
    console.log('  re       - 刷新/打开网页');
    console.log('  edit     - 开始编辑简历');
    console.log('  autofill - 自动填充当前聚焦的简历页面');
    console.log('  bstart   - 启动Boss直聘自动投递');
    console.log('  bstop    - 停止Boss直聘自动投递');
    console.log('----------------------------------------------------');

    rl.on('line', async (input) => {
        const command = input.trim().toLowerCase();

        if (command === 're') {
            console.log('[指令] 刷新/打开网页...');
            await refreshOrOpenPages();
        } else if (command === 'edit') {
            console.log('[指令] 开始编辑简历...');
            const pages = await browser.pages(); // 假设 browser 已经初始化
            for (const page of pages) {
                const url = page.url();
                if (
                    config.urls.some((targetUrl) =>
                        url.includes(new URL(targetUrl).hostname)
                    )
                ) {
                    try {
                        await resumeEditor.refreshResume(page);
                    } catch (err) {
                        console.error(`[错误] 处理页面 ${url} 时失败:`, err.message);
                    }
                } else {
                    console.log(`[跳过] 当前页面 URL 与配置不符：${url}`);
                }
            }
        } else if (command === 'autofill') {
            console.log('[指令] 开始自动填充当前聚焦的简历页面...');
            const targets = await browser.targets();
            let pageToAutofill = null; // 避免与外部 currentPage 混淆

            for (const target of targets) {
                if (target.type() === 'page') {
                    const page = await target.page();
                    if (page && page.url().startsWith('http')) {
                        pageToAutofill = page;
                        // 简单的判断“聚焦”，通常是最后一个激活的页面
                        break;
                    }
                }
            }

            if (pageToAutofill) {
                console.log(`[信息] 检测到当前聚焦页面: ${pageToAutofill.url()}`);
                try {
                    await resumeAutofill.autofillResume(pageToAutofill);
                    console.log('[指令] 自动填充完成。');
                } catch (err) {
                    console.error(`[错误] 自动填充页面 ${pageToAutofill.url()} 时失败:`, err.message);
                    console.error(err);
                }
            } else {
                console.log('[提示] 未找到可自动填充的当前聚焦页面。请确保浏览器已打开简历填写页面。');
            }
        } else if (command === 'bstart') {
            console.log('[指令] 启动Boss直聘自动投递...');
            // 获取所有活跃的目标
            const targets = await browser.targets();
            let bossPage = null;

            for (const target of targets) {
                if (target.type() === 'page') {
                    const page = await target.page();
                    // 检查页面是否存在且是有效的 HTTP(s) 页面，并且 URL 以 Boss直聘域名开头
                    if (page && page.url().startsWith('https://www.zhipin.com')) {
                        bossPage = page;
                        // 如果有多个Boss直聘页面，通常选择第一个找到的，或者可以添加更复杂的逻辑来判断“聚焦”
                        break;
                    }
                }
            }

            if (bossPage) {
                console.log(`[信息] 检测到Boss直聘页面: ${bossPage.url()}`);
                await bossAuto.bstart(bossPage);
            } else {
                console.log('[提示] 未找到当前聚焦的Boss直聘页面。请确保浏览器已打开Boss直聘职位列表页。');
            }
        } else if (command === 'bstop') {
            console.log('[指令] 停止Boss直聘自动投递...');
            bossAuto.bstop();
        } else {
            console.log('[提示] 输入命令：re, edit, autofill, bstart 或 bstop');
        }
    });

    // 初始打开页面
    await refreshOrOpenPages();
}

// 定时任务：周期性刷新页面
function scheduleAutoRefresh() {
  cron.schedule(refreshTime, async () => {
    console.log(`[定时任务] 执行刷新 (${new Date().toLocaleString()})`)
    for (let url of urls) {
      const page = openedTabs.get(url)
      if (page) {
        try {
          await page.reload({ waitUntil: 'domcontentloaded' })
          console.log(`[已刷新] ${url}`)
        } catch (err) {
          console.error(`[刷新失败] ${url}:`, err.message)
        }
      } else {
        console.log(`[未找到页面] ${url}`)
      }
    }
  })
}

// 定时任务：周期性编辑简历
function scheduleEditResume() {
  cron.schedule(editTime, async () => {
    console.log(`[定时任务] 执行简历编辑 (${new Date().toLocaleString()})`)
    resumeEditor.savedResumes.length = 0 // 清空已保存的简历
    for (const [url, page] of openedTabs.entries()) {
      try {
        await resumeEditor.refreshResume(page)
      } catch (err) {
        console.error(`[编辑失败] ${url}:`, err.message)
      }
    }
    // 任务结束后打印结果
    console.log(
      `[统计] 本次成功保存简历 ${resumeEditor.savedResumes.length} 条：`
    )
    for (const entry of resumeEditor.savedResumes) {
      console.log(`- ${entry.url} @ ${entry.time}`)
    }
  })
}

// 启动程序
;(async () => {
  await launchBrowser()
  scheduleAutoRefresh()
  scheduleEditResume()
  console.log('[启动] 浏览器已启动，定时器运行中，等待倒计时或指令...')
  await startCommandInterface()
})()
