## ReResume简历刷新脚本

## 一、目的

2025 年 5 月 1 日，现在准备做一个简历刷新的程序，Nodejs 去调用 chrome，应该比较好做到。若单纯用 c/c++应该不是很好实现。

HR 系统的确有**「最近活跃」**一栏，很多平台默认按照活跃时间倒序排序，简历长时间不更新就沉底了。
为了**保持简历刷新与在线**而开发的一套脚本。

目标网站：
ToB 的招聘前端系统：beisen 北森，moka 摩卡。
剩下的就是公司自己研发的前端系统了。

## 二、脚本目标

1. 读取配置文件config.json，里面可以修改定时刷新的时间与添加多个网页地址---已完成 
2.  定时时间到后，判断浏览器是否打开的网页地址，没有打开的就打卡并刷新--已完成 
3. 等待刷新完成后编辑并刷新简历功能--已大致完成

注意：全部模仿人操作，不能直接修改 dom 元素，每步操作须有延迟。

代码流程步骤： 
1.进入简历修改界面的关键词，
    a.直接能修改投递申请的简历：“修改申请”，“编辑”，
    b.不能直接修改申请的简历：可能得先移动鼠标到头像，“我的简历”，
优先执行 a，若 a 不行就执行 b

可能还需要点击“编辑简历”，“编辑”

2.找到第一个项目描述字段。"描述字段",或
    a.鼠标指针移动到第一个出现的“项目描述”，“描述”字段下面（右边）反正就是最近的文本框
    b.点击进入文本框开始编辑
    c.修改文本的最后的 1.逗号改成句号，或者 2.句号改成逗号。3.都没逗号与句号的添加句号。
    d.鼠标指针移除文本框，并点击空白处

3.找到保持按钮并返回投递记录页面
    a.点击保存按钮：“保存”，“预览并提交”

## 三、已发现的问题与待解决事项

问题：

1. 如修改简历时需要选择下拉栏，则会执行失败，自动跳过。
2. 若需要点击编辑图标才能进入编辑简历页面，则会执行失败，自动跳过。
3. 现在是编辑第一个文本框，若简历文本框中没有内容也会执行失败，自动跳过。

## 四、如何使用

### （一）安装环境

注意：此项目是基于 **Node.js** 的脚本项目，如果你的电脑尚未安装 Node.js，请先前往 [Node.js 官网](https://nodejs.org/) 安装对应版本。笔者版本为v18.15.0

进入项目目录后，在终端中执行以下命令以安装依赖：

```shell
npm install
```

### （二）修改config.json

请根据你的实际情况编辑 `config.json` 文件内容，示例格式如下：

```json
{
  "refreshTime": "30 * * * *",
  "editTime": "5 8 * * *",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "urls": [
    "https://hr-campus.vivo.com/personal/deliveryRecord",
    "https://arashivision.jobs.feishu.cn/campus/position/application",
    "https://campus.jd.com/#/myDeliver?type=present",
    "https://careers.oppo.com/university/oppo/center/history",
    "https://fibocom.zhiye.com/personal/deliveryRecord",
    "https://mediatek.zhiye.com/personal/deliveryRecord",
    "https://xiaomi.jobs.f.mioffice.cn/internship/position/application?spread=6AA3R7B",
    "https://career.honor.com/SU61b9b9992f9d24431f5050a5/pb/account.html#/myDeliver",
    "https://transsion.zhiye.com/personal/deliveryRecord",
    "https://app.mokahr.com/campus-recruitment/aftershokzhr/36940#/candidateHome/applications",
    "https://hr.tp-link.com.cn/socialDelivery",
    "https://career.honor.com/SU61b9b9992f9d24431f5050a5/pb/account.html#/myDeliver",
    "https://leapmotor.zhiye.com/personal/deliveryRecord",
    "https://app.mokahr.com/campus-recruitment/voyah/146293#/candidateHome/applications",
    "https://kangni.zhiye.com/personal/deliveryRecord"
  ]
}

```

1. 参数说明：
   - **refreshTime**：简历页面的自动刷新时间，使用的是标准 [Cron 表达式](https://crontab.guru/)。"分  时  日  月  星期"。
     - 示例：`"30 * * * *"` 表示每小时的第 30 分钟刷新一次页面。
   - **editTime**：自动编辑简历的时间。
     - 示例：`"5 8 * * *"` 表示每天早上 8:05 自动编辑简历。
   - **chromePath**：你的 Chrome 浏览器路径（**注意使用双反斜杠** `\\` 作为路径分隔符）。
   - **urls**：你希望自动访问的简历投递记录页面链接列表。请确保每个链接都正确指向你个人的简历记录页面。需要在投递记录页面的URL网址，如下图所示：

![](https://picture-blog-1317985215.cos.ap-guangzhou.myqcloud.com/blog/20250506122004.png?imageSlim)



### （三）执行脚本

在终端中运行以下命令启动脚本：

```bash
node index.js
```

如果看到如下界面，说明脚本已成功启动，并将根据设定的定时任务自动执行操作：

![运行成功示例](https://picture-blog-1317985215.cos.ap-guangzhou.myqcloud.com/blog/20250506122322.png?imageSlim)

此外，你也可以在脚本运行时直接手动输入命令来立即执行相关操作：

```bash
re    # 立即刷新所有简历页面
edit  # 立即执行自动编辑简历
```

这样无需等待定时任务触发，可以随时进行调试和操作。