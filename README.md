# 🎵 八音盒旋转木马 · 可分享的照片相册

一个单文件网页：复古八音盒风格的 3D 旋转木马，顶棚垂下 12 个挂钩，挂着一圈**拍立得照片**。任何人可以上传照片生成**专属分享链接**，朋友打开链接就能看到挂满照片的木马、听到你选的背景音乐。

所有交互保留并升级：按住空白处左右拖动推木马（惯性阻尼回弹）、鼠标碰到照片/丝线会被"拨开"（弹簧-阻尼回摆）、**拖一张照片到另一张上可以交换位置**（云端同步）、点击照片可以删除（仅限自己上传的）。

## 文件结构

```
carousel/
├── index.html      ← 全部代码（单文件，无构建步骤）
├── supabase.sql    ← Supabase 初始化脚本（接云时执行一次）
├── README.md       ← 本文件
└── assets/
    ├── carousel.glb        ← （你自己放入）3D 模型，可选
    ├── carousel/scene.gltf ← （或）Sketchfab 解压后的文件夹，二选一
    └── carousel-preview.png ← 推荐模型的预览图
```

## 一、快速开始

**方式 A（什么都不装）**：直接双击 `index.html`。因为没有本地模型文件，会显示几何体拼的简易木马（程序化兜底），所有交互和上传都能玩（本地演示模式：照片刷新后消失）。

**方式 B（推荐，显示精美模型）**：模型文件必须通过 HTTP 加载（浏览器安全限制），需要本地服务器：

- VS Code 用户：装 **Live Server** 扩展 → 右键 `index.html` → Open with Live Server
- 或命令行：在本文件夹执行 `python -m http.server 8000`，浏览器开 `http://localhost:8000`

## 二、安装八音盒模型（核心步骤）

推荐模型（已验证风格、尺寸、协议）：**Christmas Carousel** by SkyeSladeUT
链接：https://sketchfab.com/3d-models/christmas-carousel-fa6e353954f8424f9f466571d8ae949e
（红瓦金边尖顶、驯鹿拉雪橇，4.2 万顶点，CC-BY 协议需署名——本页面左下角已带署名）

1. 打开上面的链接，注册/登录 Sketchfab（免费）
2. 点 **Download 3D Model** → 选 **glTF** 格式，得到一个 zip
3. 解压，把解压出来的**整个文件夹**（里面有 `scene.gltf`、`scene.bin`、`textures/`）改名并放进项目：

```
carousel/assets/carousel/scene.gltf   ← 这样就完成了
```

4. 刷新网页，简易木马会自动被精美模型替换，照片锚点自动对齐新顶棚。

**想要单文件？** 把 zip 里的模型转成 .glb 后命名为 `assets/carousel.glb` 放入即可（可用 https://gltf.report 在线转换：拖入 scene.gltf → Export glb）。两种都存在时优先加载 `.glb`。

**想换成别的模型？** 任何 .glb 都可以——代码会自动缩放到合适尺寸、落地居中、按比例测量顶棚位置挂照片。若锚点位置不理想，调 `index.html` 顶部的两个参数：

```js
const ANCHOR_R_FACTOR = 0.92;  // 挂钩半径 = 模型半径 × 系数
const ANCHOR_Y_FACTOR = 0.80;  // 挂钩高度 = 模型高度 × 系数
```

## 三、接入 Supabase（上传共享 + 专属链接）

不接云也能玩（本地演示模式），接云之后才能"用户A上传 → 得到链接 → 用户B看到"。

1. 打开 https://supabase.com → Sign up（免费）→ New project（起个名字，密码随手记，区域选 Singapore/Northeast Asia 近一些）
2. 左侧 **SQL Editor** → New query → 把 `supabase.sql` 全文粘贴 → **Run**（建表、建存储桶、建函数、开 Realtime，一步到位）
3. 左侧 **Project Settings (⚙) → API**，复制两个值：
   - **Project URL** → 填进 `index.html` 顶部 `SUPABASE_URL`
   - **anon public key** → 填进 `SUPABASE_ANON_KEY`
4. 刷新网页 → 右上角变成「已连接云 · 公共木马」

**anon key 是公开密钥**，本来就是用来放在前端代码里的，泄露无风险；真正的写权限校验在数据库函数里（只有相册主人能上传/删除/交换）。

## 四、使用流程（两种玩法）

**玩法一：公共照片墙（默认首页）**
- 打开基础网址就是**公共照片墙**：**任何人都能上传**照片、换背景音乐、拖拽交换位置——大家共同装扮这匹木马，所有人的改动实时互相可见
- 右下角状态显示「已连接云 · 公共照片墙」
- 删除规则：只能删除自己上传的照片

**玩法二：专属相册（送朋友）**
1. 在公共照片墙点 **「🎁 创建我的专属相册」** → 网址变成 `你的域名/?g=abc12`
2. 上传照片、选一首音乐 → 点「🔗 复制分享链接」发给朋友
3. **用户B** 打开链接：看到挂满你照片的木马、听到你的音乐，可以推木马、拨照片，但看不到上传/删除按钮（访客只能看）
4. 你再传、删、拖拽交换位置，B 的画面**几秒内实时跟着变**（Supabase Realtime）
5. 超过 12 张时最旧的自动被顶替（固定挂钩轮流替换）

> 主人身份存在浏览器里（不用注册登录）。如果 A 清了浏览器缓存或换电脑，链接仍可访问，但会失去"主人"身份，无法再编辑该专属相册（公共照片墙不受影响）。

## 五、部署上线（让所有人通过公网访问）

> **老项目注意**：如果你的 Supabase 是在"公共照片墙"功能发布前配置的，先去 SQL Editor 跑一遍 `upgrade-public.sql`，否则公共墙上传会报"不是相册主人"。

**方式一：Netlify Drop（最简单，1 分钟，不用 GitHub）**
1. 打开 https://app.netlify.com/drop
2. 把整个 `carousel` 文件夹拖进去
3. 得到 `xxxx.netlify.app` 网址 —— 完成（记得先把模型文件和 Supabase Key 填好再拖）

**方式二：GitHub + GitHub Pages**（想要版本管理就用这个）
1. 注册/登录 GitHub → 右上角 + → New repository（起名如 `carousel`，Public）
2. 仓库页点 **uploading an existing file**，把 `index.html`、`supabase.sql`、`README.md` 和整个 `assets` 文件夹拖进去 → Commit changes
   （注意：浏览器一次最多拖 100 个文件，模型文件大时先传其余文件再单独 Add file）
3. Settings → Pages → Source 选 `Deploy from a branch` → Branch 选 `main` / `(root)` → Save
4. 等 1-2 分钟，得到 `你的用户名.github.io/仓库名` 网址

**方式三：Cloudflare Pages**（国内访问通常更稳）—— Dash → Pages → Upload assets → 拖文件夹。

部署后建议：Supabase 后台 → Authentication → URL Configuration，把 Site URL 填成你的正式网址（可选，更规范）。

**部署后旧链接怎么办**：相册数据都在 Supabase 云上，换域名不丢。把旧链接 `?g=xxx` 的参数拼到新域名后面（`新域名/?g=xxx`）就能继续用。

## 六、常见问题

- **双击打开看不到模型？** 正常。浏览器禁止 `file://` 页面读取本地文件（含模型）。用 Live Server 或部署后就能看到。
- **音乐不会自动响？** 浏览器规定必须有用户交互后才能播放——点一下页面任意位置即可。右下角按钮控制开关。
- **上传的图片会占很大空间吗？** 不会，上传前自动裁成正方形并压缩到 720×720 JPEG（约 100KB/张）。
- **照片挂得太挤/太低？** 调 `index.html` 顶部的 `LINE_MIN/LINE_MAX`（丝线长度）、`PHOTO_MIN/PHOTO_MAX`（照片大小）、`SLOT_COUNT`（挂钩数量，改完要同步改 `supabase.sql` 里的 `generate_series(0, 11)`）。
- **Supabase 免费额度够吗？** 免费档：500MB 存储 + 5GB 流量/月，够挂几千张 720px 照片。
- **安全提示**：Storage 桶目前是"知道链接即可读写"的演示级策略（照片链接本身是公开的，被随意删的途径主要是数据库函数已挡住）。想更严格可后续接入 Supabase Auth。

## 七、技术备忘

- Three.js 0.160（esm.sh CDN）+ GLTFLoader，无需构建
- 模型自动归一化：缩放至直径 ≤26、高度 ≤22，落地居中，Box3 测量顶棚边缘挂照片
- 拍立得 = Canvas 512×640 纹理（相纸 + 照片区 + 楷体手写昵称），正面/背面双平面，背面是素色相纸
- 物理：弹簧-阻尼（k=0.1, damping=0.85）+ 钟摆倾斜 + 悬浮呼吸，鼠标用射线距离做推力场
- 数据：albums/photos 两张表 + 4 个 security definer RPC + Realtime 订阅
- 控制台调试钩子：`window.__car`（`state()` / `step(n)` / `dbg()` / `freeze`），测试自动化可用
