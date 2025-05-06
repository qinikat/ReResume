// resumeEditor.js
async function tryClickKeywords(page, keywords) {
  if (!page || typeof page.goto !== 'function') {
    console.error('[错误] 传入的 page 不是有效 Puppeteer 页面对象')
    return false
  }

  for (const keyword of keywords) {
    try {
      // 在页面上下文中查找含有关键词的元素（button 内或任意位置）
      const elementHandle = await page.evaluateHandle((keyword) => {
        const xpath = `//*[contains(text(), '${keyword}')]`
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        )
        return result.singleNodeValue
      }, keyword)

      if (elementHandle) {
        // 判断元素是否被禁用
        const isDisabled = await page.evaluate((el) => {
          return el.disabled || el.getAttribute('aria-disabled') === 'true'
        }, elementHandle)

        if (isDisabled) {
          console.log(`[跳过] "${keyword}" 被禁用，无法点击`)
          continue
        }

        const box = await elementHandle.boundingBox()
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
          console.log(`[点击关键词] ${keyword}`)
          await new Promise((resolve) => setTimeout(resolve, 1000))
          return true
        } else {
          console.warn(
            `[失败] 找到 "${keyword}" 元素但无法点击（无 boundingBox）`
          )
        }
      } else {
        console.log('[警告] 未找到关键词', keyword)
      }
    } catch (err) {
      console.error(`[错误] 查找关键词 "${keyword}" 时失败:`, err.message)
    }
  }

  return false
}

async function editFirstProjectTextArea(page) {
  const selectors = ['textarea', 'input[type="text"]']
  const isMac = process.platform === 'darwin'

  for (const selector of selectors) {
    const elements = await page.$$(selector)
    console.log(
      `[调试] 当前选择器 "${selector}" 找到 ${elements.length} 个元素`
    )

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]
      const boundingBox = await el.boundingBox()
      if (!boundingBox) {
        console.log(`[跳过] 元素 ${i} 无 boundingBox（不可见或隐藏）`)
        continue
      }

      const value = await page.evaluate(
        (el) => el.value || el.innerText || '',
        el
      )
      console.log(
        `[调试] 元素 ${i} 当前文本值: "${value}" (长度: ${value.length})`
      )

      if (value.length >= 5) {
        console.log(`[调试] 元素 ${i} 满足条件，准备编辑文本...`)

        const newValue = modifyText(value)
        console.log(`[调试] 准备输入的新值: "${newValue}"`)

        // 聚焦元素
        await el.focus()
        await new Promise((r) => setTimeout(r, 200))

        // 模拟 Ctrl+A 或 Cmd+A 全选
        await page.keyboard.down(isMac ? 'Meta' : 'Control')
        await page.keyboard.press('KeyA')
        await page.keyboard.up(isMac ? 'Meta' : 'Control')
        await new Promise((r) => setTimeout(r, 200))

        // 删除旧内容
        await page.keyboard.press('Backspace')
        console.log('[调试] 已执行 Ctrl+A 并清空原始内容')

        // 输入新内容
        await page.keyboard.type(newValue)
        console.log(`[调试] 已输入新内容: "${newValue}"`)

        // 模拟离开输入框
        await new Promise((r) => setTimeout(r, 500))
        await page.keyboard.press('Tab')
        console.log('[调试] 已按 Tab 离开输入框')

        return true
      }
    }
  }

  console.log('[警告] 未找到合适的文本框进行编辑')
  return false
}

function modifyText(text) {
  if (text.endsWith('，')) return text.slice(0, -1) + '。'
  if (text.endsWith('。')) return text.slice(0, -1) + '，'
  return text + '。'
}

async function tryClickKeywordsForRadioButton(page, keywords) {
  const elements = await page.$$('label, span, div, p')

  console.log(`[调试] 发现 ${elements.length} 个文本容器`)

  for (const keyword of keywords) {
    let matched = false

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]
      const text = await page.evaluate((el) => el.innerText || '', el)

      if (!text || text.length > 100) continue

      if (text.includes(keyword)) {
        console.log(`[匹配] 找到 "${keyword}" 的元素: "${text.trim()}"`)

        // 检查其内部或关联的 checkbox/radio
        const input = await el.$('input[type="checkbox"], input[type="radio"]')
        if (input) {
          const isChecked = await page.evaluate((input) => input.checked, input)
          if (!isChecked) {
            await input.click()
            console.log(`[点击] 勾选 "${keyword}" 成功`)
          } else {
            console.log(`[跳过] "${keyword}" 已经勾选，无需重复点击`)
          }
          matched = true
          break
        }

        // 没有 input 元素，尝试点击整个元素（假设是包裹点击）
        const box = await el.boundingBox()
        if (box) {
          const centerX = box.x + box.width / 2
          const centerY = box.y + box.height / 2

          // 再尝试点一下（也可以考虑截图/OCR）
          await el.click()
          console.log(`[点击] 未找到 input，直接点击元素本身: "${keyword}"`)
          matched = true
          break
        }
      }
    }

    if (!matched) {
      console.warn(`[警告] 未找到与 "${keyword}" 匹配的可点击项`)
    }

    await new Promise((r) => setTimeout(r, 500))
  }
}

async function tryHoverUserBar(
  page,
  keywords = ['头像', '用户', '+86', '个人中心', '1364']
) {
  if (!page || typeof page.goto !== 'function') {
    console.error('[错误] 传入的 page 不是有效 Puppeteer 页面对象')
    return false
  }

  for (const keyword of keywords) {
    try {
      const elementHandle = await page.evaluateHandle((keyword) => {
        const xpath = `//*[contains(text(), '${keyword}')]`
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        )
        return result.singleNodeValue
      }, keyword)

      const element = elementHandle.asElement()
      if (element) {
        const box = await element.boundingBox()
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
          console.log(`[悬停关键词] ${keyword}`)
          await new Promise((resolve) => setTimeout(resolve, 1500)) // 给下拉框时间显示
          return true
        } else {
          console.warn(
            `[失败] 找到 "${keyword}" 元素但无法 hover（无 boundingBox）`
          )
        }
      } else {
        console.log('[警告] 未找到关键词', keyword)
      }
    } catch (err) {
      console.error(`[错误] 悬停关键词 "${keyword}" 时失败:`, err.message)
    }
  }

  return false
}

async function tryClickLastKeyword(page, keywords) {
  if (!page || typeof page.goto !== 'function') {
    console.error('[错误] 传入的 page 不是有效 Puppeteer 页面对象')
    return false
  }

  // 将关键词数组逆序，确保优先点击最后出现的按钮
  const reversedKeywords = [...keywords].reverse()

  for (const keyword of reversedKeywords) {
    try {
      // 在页面上下文中查找完全匹配关键词的元素
      const elementHandle = await page.evaluateHandle((keyword) => {
        const xpath = `//*[text() = '${keyword}']`
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        )
        return result.singleNodeValue
      }, keyword)

      if (elementHandle) {
        const box = await elementHandle.boundingBox()
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
          console.log(`[点击关键词] ${keyword}`)
          await new Promise((resolve) => setTimeout(resolve, 1000))
          return true
        } else {
          console.warn(
            `[失败] 找到 "${keyword}" 元素但无法点击（无 boundingBox）`
          )
        }
      } else {
        console.log('[警告] 未找到关键词', keyword)
      }
    } catch (err) {
      console.error(`[错误] 查找关键词 "${keyword}" 时失败:`, err.message)
    }
  }

  return false
}

// 全局统计变量
const savedResumes = []

async function refreshResume(page) {
  try {
    await page.bringToFront()
    console.log('[信息] 当前标签页已切换到前台')
    const originalUrl = page.url()
    console.log(`开始编辑简历... 当前页面：${originalUrl}`)

    // === 必做 Step 1: 进入简历编辑页面 ===
    const enteredEditor = await tryClickKeywords(page, ['修改申请', '编辑'])
    if (page.url() == originalUrl) {
      console.log('[切换方案] 尝试进入个人简历页...')
      //鼠标悬停用户头像触发下拉菜单 ===
      await tryHoverUserBar(page)

      const hovered = await tryClickKeywords(page, ['我的简历'])
      if (page.url() == originalUrl) {
        console.log('[失败] 无法进入简历编辑页面，流程中止')
        return
      }
    }

    // 可选 Step: 点击编辑确认按钮
    await new Promise((r) => setTimeout(r, 1500))
    await tryClickKeywords(page, ['修改申请', '编辑'])

    // === 必做 Step 2: 修改简历内容 ===
    await new Promise((r) => setTimeout(r, 2000))
    const edited = await editFirstProjectTextArea(page)
    if (!edited) {
      console.log('[警告] 没有找到文本框或未进行修改')
    } else {
      console.log('[信息] 简历内容已编辑')
    }

    // === 可选 Step: 尝试勾选所有单选框 ===
    await new Promise((r) => setTimeout(r, 1500))
    await tryClickKeywordsForRadioButton(page, [
      '确认',
      '同步更新在线简历',
      '我已阅读并同意',
      '隐私协议',
      '隐私政策说明',
    ])

    // === 必做 Step 3: 点击保存按钮 ===
    // 记录点击前的 URL
    const urlBeforeSubmit = page.url()
    await new Promise((r) => setTimeout(r, 1500))
    const saved = await tryClickLastKeyword(page, [
      '预览并提交',
      '保存',
      '提交',
      '投递简历',
    ])
    if (!saved) {
      console.log('[失败] 未能保存简历')
      return
    }

    // === 可选 Step: 提交确认对话框按钮 ===
    await new Promise((r) => setTimeout(r, 1500))
    await tryClickKeywords(page, ['确认提交', '确定', '提交'])

    await new Promise((r) => setTimeout(r, 2000))
    // 获取当前 URL 并比较
    const urlAfterSubmit = page.url()
    if (urlAfterSubmit !== urlBeforeSubmit) {
      const timestamp = new Date().toLocaleString()
      console.log(`[成功] 简历已保存并跳转成功 @ ${timestamp}`)
      savedResumes.push({ url: urlAfterSubmit, timestamp })
    }

    // === 返回原页面 ===
    await new Promise((r) => setTimeout(r, 1000))
    console.log(`[信息] 返回原页面：${originalUrl}`)

    // 注册对浏览器原生对话框（如“未保存更改”）的处理器
    page.once('dialog', async (dialog) => {
      console.log(
        `[浏览器弹窗] 类型: ${dialog.type()}，消息: ${dialog.message()}`
      )
      await dialog.accept()
      console.log('[处理] 已点击浏览器弹窗的“离开”')
    })

    // 执行跳转
    await page.goto(originalUrl, { waitUntil: 'networkidle0' })
  } catch (err) {
    console.error('[编辑简历失败]', err.message)
  }

  console.log('[信息] 编辑简历流程结束')
  // === 打印统计 ===
  console.log(`\n[统计] 本次成功保存 ${savedResumes.length} 份简历：`)
  savedResumes.forEach((item, index) => {
    console.log(`  ${index + 1}. [${item.timestamp}] ${item.url}`)
  })
}

module.exports = {
  refreshResume,
  savedResumes,
}
