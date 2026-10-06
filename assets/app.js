        import * as THREE from 'three';
        import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

        /* ============================================================
         * ★★★ 配置区 ★★★
         * 把你在 Supabase 拿到的两个值填进来，网页就升级成"云相册"。
         * 不填也能玩：本地演示模式（照片刷新后消失、无法分享给别人）。
         * 详细步骤看 README.md
         * ============================================================ */
        const SUPABASE_URL = 'https://dsxidhgwdtfjhkktywde.supabase.co';           // 例如 'https://xxxxx.supabase.co'
        const SUPABASE_ANON_KEY = 'sb_publishable_fwuZEh63Ukc24vLb3f1E8A_jJJfPBum';      // 例如 'eyJhbGciOi...'

        /* ---------- 可调参数 ---------- */
        const SLOT_COUNT = 12;          // 固定挂钩数量（新照片轮流替换最旧的）
        const TARGET_DIAMETER = 26;     // 3D 模型自动归一化：目标直径
        const TARGET_HEIGHT = 22;       // 目标高度
        const ANCHOR_R_FACTOR = 0.92;   // 挂钩半径 = 模型半径 × 此系数
        const ANCHOR_Y_FACTOR = 0.80;   // 挂钩高度 = 模型高度 × 此系数（顶棚边缘）
        const LINE_MIN = 4.0, LINE_MAX = 7.5;   // 丝线长度范围
        const PHOTO_MIN = 2.0, PHOTO_MAX = 2.8; // 拍立得大小范围
        const PUSH_RADIUS = 7;          // 鼠标"拨动"照片的作用半径

        /* ============================================================
         * 0. 全局状态
         * ============================================================ */
        let cloud = null;               // Supabase 客户端（未配置则为 null）
        let mode = 'base';              // 'base' 公共照片墙 | 'album' 专属相册
        let albumId = null;
        let isOwner = false;
        // 扭蛋机纸条
        let notes = [];               // 当前相册的纸条 { id, kind, content, url, uploader_id }
        let noteBag = [], lastNoteId = null;
        let gachaGroup = null, gachaKnob = null, gachaEgg = null, gachaBalls = null;
        let gachaAnim = null, gachaTwisting = false;
        let ballAlive = [];
        const CANDY_COLORS = [0xff6b81, 0xffd93d, 0x6bcb77, 0x4d96ff, 0xef7ae5, 0xffa64d];
        const visitorId = (() => {      // 每台浏览器一个随机身份，不用登录
            let v = localStorage.getItem('car_visitor');
            if (!v) { v = crypto.randomUUID(); localStorage.setItem('car_visitor', v); }
            return v;
        })();
        const nickname = (() => {
            let n = localStorage.getItem('car_nick');
            if (!n) { n = '访客#' + Math.floor(10 + Math.random() * 90); localStorage.setItem('car_nick', n); }
            return n;
        })();

        const photos = [];              // 场景里所有照片
        const anchors = [];             // SLOT_COUNT 个挂钩
        let carouselDims = null;        // 模型归一化后的 { radius, topY }
        let carouselReady = false;      // 挂钩建好之前忽略交互

        /* ============================================================
         * 1. 初始化 3D 场景
         * ============================================================ */
        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x050510, 0.003);

        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 17, 47);
        camera.lookAt(0, 8, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        document.body.appendChild(renderer.domElement);

        scene.add(new THREE.AmbientLight(0x504a5e, 1.9));
        const spotLight = new THREE.SpotLight(0xffdd88, 800, 120, Math.PI / 4, 0.5, 2);
        spotLight.position.set(20, 40, 20);
        spotLight.castShadow = true;
        scene.add(spotLight);
        // 木马内部暖光：让机身像被点亮一样
        const innerLight = new THREE.PointLight(0xffd9a0, 450, 50, 1.8);
        innerLight.position.set(0, 9, 0);
        scene.add(innerLight);
        const fillLight = new THREE.PointLight(0x4466ff, 140, 60);
        fillLight.position.set(0, -8, 18);
        scene.add(fillLight);

        /* ============================================================
         * 2. 旋转木马本体（三级加载链）
         *    ① assets/carousel.glb        单文件模型（推荐，最简单）
         *    ② assets/carousel/scene.gltf Sketchfab 下载的 zip 直接解压成这个文件夹
         *    ③ 都没有 → 几何体拼简易木马（保证双击 HTML 也能跑）
         * ============================================================ */
        const carouselGroup = new THREE.Group();
        scene.add(carouselGroup);

        /* ---------- 程序化复古旋转木马（无外部模型时的兜底，保持纯几何体） ---------- */
        const bobbers = [];   // 需要上下起伏的小马
        const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffcc66, emissiveIntensity: 1.5, roughness: 0.4 });

        function makeStripeTexture(c1, c2, stripes = 12, w = 512, h = 256) {
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            const ctx = c.getContext('2d');
            const sw = w / stripes;
            for (let i = 0; i < stripes; i++) {
                ctx.fillStyle = i % 2 ? c1 : c2;
                ctx.fillRect(i * sw, 0, sw + 1, h);
            }
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, 'rgba(0,0,0,0.12)'); grad.addColorStop(0.5, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.18)');
            ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
            const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
            t.wrapS = THREE.RepeatWrapping; return t;
        }

        function makeValanceTexture() {
            const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
            const ctx = c.getContext('2d');
            const n = 8, sw = c.width / n;
            for (let i = 0; i < n; i++) {
                ctx.fillStyle = i % 2 ? '#d4af37' : '#b8302e';
                ctx.fillRect(i * sw, 0, sw, 64);
                ctx.beginPath();
                ctx.arc(i * sw + sw / 2, 64, sw / 2, 0, Math.PI);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,240,200,0.85)';
                ctx.beginPath();
                ctx.arc(i * sw + sw / 2, 64, 9, 0, Math.PI * 2);
                ctx.fill();
            }
            const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
            t.wrapS = THREE.RepeatWrapping; t.repeat.x = 2; return t;
        }

        function makeHorse(bodyColor, saddleColor, goldMat) {
            const g = new THREE.Group();
            const mat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.45 });
            const saddleMat = new THREE.MeshStandardMaterial({ color: saddleColor, roughness: 0.5 });
            const hoofMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.55 });
            const maneMat = new THREE.MeshStandardMaterial({ color: 0xd8b46a, roughness: 0.6 });
            const darkMat = new THREE.MeshStandardMaterial({ color: 0x2e2a33, roughness: 0.4 });

            const add = (geoOrMesh, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
                const mesh = geoOrMesh.isMesh ? geoOrMesh : new THREE.Mesh(geoOrMesh, m);
                mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
                mesh.castShadow = true; g.add(mesh); return mesh;
            };

            // 躯干：椭球（圆润，前胸后臀饱满）
            const body = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), mat);
            body.scale.set(0.4, 0.55, 1.15); add(body, 0, 0, 0);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat);
            chest.scale.set(0.34, 0.48, 0.5); add(chest, 0, -0.04, 0.72);
            const rump = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat);
            rump.scale.set(0.36, 0.5, 0.55); add(rump, 0, 0.03, -0.78);

            // 脖子（锥形，前倾）+ 头 + 口鼻 + 耳朵 + 眼睛 —— 头颈前伸，不仰头
            add(new THREE.CylinderGeometry(0.19, 0.33, 1.25, 10), mat, 0, 0.75, 0.98, 0.38);
            const head = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), mat);
            head.scale.set(0.24, 0.28, 0.42); add(head, 0, 1.3, 1.52, 0.12);
            add(new THREE.BoxGeometry(0.32, 0.28, 0.5), mat, 0, 1.18, 1.98, 0.02);   // 口鼻
            add(new THREE.ConeGeometry(0.08, 0.28, 6), mat, 0.14, 1.66, 1.36, -0.3); // 耳朵
            add(new THREE.ConeGeometry(0.08, 0.28, 6), mat, -0.14, 1.66, 1.36, -0.3);
            add(new THREE.SphereGeometry(0.05, 8, 6), darkMat, 0.21, 1.42, 1.68);    // 眼睛
            add(new THREE.SphereGeometry(0.05, 8, 6), darkMat, -0.21, 1.42, 1.68);

            // 鬃毛：沿脖子后侧一串
            for (let i = 0; i < 5; i++) {
                const s = 0.13 - i * 0.012;
                add(new THREE.SphereGeometry(s, 8, 6), maneMat, 0, 1.46 - i * 0.22, 1.1 - i * 0.12, 0.4);
            }

            // 四腿：小跑姿态（前扬后蹬）+ 深色蹄子，绕髋/肩部旋转
            const leg = (x, z, rx) => {
                const lg = new THREE.Group();
                lg.position.set(x, -0.32, z);
                const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.065, 1.1, 8), mat);
                cyl.position.y = -0.5; cyl.castShadow = true;
                const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.115, 0.15, 8), hoofMat);
                hoof.position.y = -1.1;
                lg.add(cyl, hoof); lg.rotation.x = rx; g.add(lg);
            };
            leg(0.28, 0.72, -0.55);  leg(-0.28, 0.72, -0.48);   // 前腿前扬
            leg(0.28, -0.75, 0.42);  leg(-0.28, -0.75, 0.48);   // 后腿后蹬

            // 尾巴 + 鞍 + 肚带
            add(new THREE.ConeGeometry(0.13, 0.9, 7), maneMat, 0, -0.05, -1.18, 2.75);
            add(new THREE.BoxGeometry(0.78, 0.14, 0.85), saddleMat, 0, 0.6, 0.12);
            add(new THREE.BoxGeometry(0.92, 0.06, 1.15), goldMat, 0, 0.51, 0.12);
            const girth = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.045, 8, 24), saddleMat);
            girth.rotation.x = Math.PI / 2; girth.scale.y = 0.72;
            add(girth, 0, -0.05, 0.42);

            // 小零件不投影，省一半阴影通道开销（低帧率设备更流畅）
            g.traverse(o => {
                if (o.isMesh) {
                    o.geometry.computeBoundingSphere();
                    if (o.geometry.boundingSphere.radius < 0.25) o.castShadow = false;
                }
            });
            return g;
        }

        function buildProceduralCarousel() {
            const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.75, roughness: 0.3 });
            const creamMat = new THREE.MeshStandardMaterial({ color: 0xf0e6d2, roughness: 0.6 });
            const darkRed = new THREE.MeshStandardMaterial({ color: 0x8f1d22, roughness: 0.45 });

            // ---- 底座：三层 ----
            const skirt = new THREE.Mesh(new THREE.CylinderGeometry(16.2, 15.6, 0.9, 48), darkRed);
            skirt.position.y = 0.45; skirt.receiveShadow = true; carouselGroup.add(skirt);

            const band = new THREE.Mesh(
                new THREE.CylinderGeometry(14.2, 14.6, 1.1, 48),
                new THREE.MeshStandardMaterial({ map: makeStripeTexture('#d4af37', '#f5ead0', 16, 512, 128), roughness: 0.55 })
            );
            band.position.y = 1.7; band.castShadow = band.receiveShadow = true; carouselGroup.add(band);

            const platform = new THREE.Mesh(new THREE.CylinderGeometry(13.2, 13.2, 0.5, 48), creamMat);
            platform.position.y = 2.5; platform.receiveShadow = true; carouselGroup.add(platform);

            const rim = new THREE.Mesh(new THREE.TorusGeometry(13.25, 0.13, 10, 64), goldMat);
            rim.rotation.x = Math.PI / 2; rim.position.y = 2.76; carouselGroup.add(rim);

            // ---- 中心柱 + 顶球 ----
            const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 12.9, 24), goldMat);
            pillar.position.y = 9.05; pillar.castShadow = true; carouselGroup.add(pillar);
            for (const ry of [5.6, 12.2]) {
                const ring = new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.08, 8, 32), darkRed);
                ring.rotation.x = Math.PI / 2; ring.position.y = ry; carouselGroup.add(ring);
            }
            const hub = new THREE.Mesh(new THREE.SphereGeometry(1.35, 20, 16), goldMat);
            hub.position.y = 15.3; carouselGroup.add(hub);

            // ---- 顶棚：条纹锥顶 + 花边垂幕 + 跑马灯 ----
            const roof = new THREE.Mesh(
                new THREE.ConeGeometry(14.5, 5.5, 48),
                new THREE.MeshStandardMaterial({ map: makeStripeTexture('#b8302e', '#f5ead0', 12), roughness: 0.5 })
            );
            roof.position.y = 18.25; roof.castShadow = true; carouselGroup.add(roof);

            const valance = new THREE.Mesh(
                new THREE.CylinderGeometry(14.45, 14.45, 1.25, 48, 1, true),
                new THREE.MeshStandardMaterial({ map: makeValanceTexture(), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 })
            );
            valance.position.y = 14.95; carouselGroup.add(valance);

            const roofTrim = new THREE.Mesh(new THREE.TorusGeometry(14.4, 0.16, 10, 64), goldMat);
            roofTrim.rotation.x = Math.PI / 2; roofTrim.position.y = 15.62; carouselGroup.add(roofTrim);

            for (let i = 0; i < 24; i++) {           // 檐口灯泡
                const a = (i / 24) * Math.PI * 2;
                const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), bulbMat);
                bulb.position.set(Math.cos(a) * 14.15, 15.95, Math.sin(a) * 14.15);
                carouselGroup.add(bulb);
            }

            // 顶饰：金球 + 尖塔 + 小红旗
            const finial = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), goldMat);
            finial.position.y = 21.15; carouselGroup.add(finial);
            const spire = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 10), goldMat);
            spire.position.y = 21.85; carouselGroup.add(spire);
            const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.6),
                new THREE.MeshStandardMaterial({ color: 0xb8302e, side: THREE.DoubleSide, roughness: 0.7 }));
            flag.position.set(0.52, 22.15, 0); carouselGroup.add(flag);

            // ---- 6 匹小马 + 金色吊杆（马会上下起伏） ----
            const horseColors = [[0xfaf6ee, 0xb8302e], [0xe8c98a, 0x2f5d8a]];
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const [bc, sc] = horseColors[i % 2];
                const horse = makeHorse(bc, sc, goldMat);
                horse.scale.setScalar(1.3);
                horse.position.set(Math.cos(angle) * 9, 4.95, Math.sin(angle) * 9);
                horse.rotation.y = -angle;
                carouselGroup.add(horse);
                bobbers.push({ mesh: horse, baseY: 4.95, phase: i * 1.1 });

                const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 12.9, 10), goldMat);
                pole.position.set(Math.cos(angle) * 9, 9.0, Math.sin(angle) * 9);
                pole.castShadow = true; carouselGroup.add(pole);
            }

            return { radius: 13.5, topY: 19.8 };  // 供挂钩定位：y=15.84（垂幕下沿）、r=12.42（檐内）
        }

        // 手写字体就绪（Ma Shan Zheng，OFL 免费商用，随仓库分发）
        const HAND_FONT = '"Ma Shan Zheng", "KaiTi", "STKaiti", cursive';
        const fontReady = (document.fonts && document.fonts.load)
            ? Promise.all([
                document.fonts.load('90px "Ma Shan Zheng"', '梦幻游乐园扭蛋屋'),
                document.fonts.load('46px "Ma Shan Zheng"', '写一句话给未来')
              ]).catch(() => {})
            : Promise.resolve();

        /* ==================== 游乐园大门 ==================== */
        function buildGate() {
            const gate = new THREE.Group();
            const redMat = new THREE.MeshStandardMaterial({ color: 0xb8302e, roughness: 0.4 });
            const creamMat = new THREE.MeshStandardMaterial({ color: 0xf6f1e7, roughness: 0.5 });
            const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.75, roughness: 0.3 });
            const left = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 7, 14), redMat);
            left.position.set(-4.2, 3.5, 0);
            const right = left.clone(); right.position.x = 4.2;
            const top = new THREE.Mesh(new THREE.BoxGeometry(10.4, 1.1, 1.0), creamMat);
            top.position.set(0, 7.2, 0);
            const roofL = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.2, 10), goldMat);
            roofL.position.set(-4.2, 8.2, 0);
            const roofR = roofL.clone(); roofR.position.x = 4.2;
            // 牌匾：深色木板 + 金色手写艺术字（字体加载后重绘）
            const bsc = document.createElement('canvas'); bsc.width = 1024; bsc.height = 256;
            const drawBoard = () => {
                const bx = bsc.getContext('2d');
                const g = bx.createLinearGradient(0, 0, 0, 256);
                g.addColorStop(0, '#241533'); g.addColorStop(1, '#120a1e');
                bx.fillStyle = g; bx.fillRect(0, 0, 1024, 256);
                bx.strokeStyle = '#d4af37'; bx.lineWidth = 10; bx.strokeRect(14, 14, 996, 228);
                bx.strokeStyle = 'rgba(212,175,55,0.5)'; bx.lineWidth = 3; bx.strokeRect(30, 30, 964, 196);
                bx.fillStyle = '#d4af37';
                for (const pt of [[30, 30], [994, 30], [30, 226], [994, 226]]) {
                    bx.beginPath(); bx.arc(pt[0], pt[1], 9, 0, Math.PI * 2); bx.fill();
                }
                bx.fillStyle = '#ffe9b0';
                bx.shadowColor = 'rgba(255,200,100,0.55)'; bx.shadowBlur = 26;
                bx.font = '150px "Ma Shan Zheng", "KaiTi", cursive';
                bx.textAlign = 'center'; bx.textBaseline = 'middle';
                bx.fillText('梦幻游乐园', 512, 140);
                bx.shadowBlur = 0;
                bx.fillStyle = 'rgba(255,233,176,0.75)';
                bx.font = '26px sans-serif';
                bx.fillText('· D R E A M · P A R K ·', 512, 226);
            };
            drawBoard();
            fontReady.then(() => { drawBoard(); signTex.needsUpdate = true; });
            const signTex = new THREE.CanvasTexture(bsc);
            const sign = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 2.9),
                new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide, toneMapped: false }));
            sign.position.set(0, 7.3, 0.6);
            const boardBack = new THREE.Mesh(new THREE.BoxGeometry(12.2, 3.2, 0.16),
                new THREE.MeshStandardMaterial({ color: 0x1a1030, roughness: 0.6 }));
            boardBack.position.set(0, 7.3, 0.5);
            const lanternMat = new THREE.MeshStandardMaterial({ color: 0xd84545, roughness: 0.4, emissive: 0x882020, emissiveIntensity: 0.6 });
            const lanterns = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 10, 8), lanternMat, 6);
            const lm4 = new THREE.Matrix4();
            for (let i = 0; i < 6; i++) lm4.setPosition(-4.4 + i * 1.76, 6.1, 0.8), lanterns.setMatrixAt(i, lm4);
            gate.add(lanterns);
            const walk = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.06, 22),
                new THREE.MeshStandardMaterial({ color: 0x6e5a35, roughness: 0.85 }));
            walk.position.set(0, 0.02, 41);
            const lampL = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8),
                new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffcc66, emissiveIntensity: 1.5 }));
            lampL.position.set(-4.2, 6.2, 0);
            const lampR = lampL.clone(); lampR.position.x = 4.2;
            gate.add(left, right, top, roofL, roofR, sign, boardBack, walk, lampL, lampR, lanterns);
            gate.position.set(0, 0, 30);
            scene.add(gate);
        }

        /* ==================== 扭蛋机 ==================== */
        // 几何合并（同材质多部件合一，降低 draw call）
        function mergeGeoms(items) {
            let posCount = 0, idxCount = 0;
            for (const g of items) {
                posCount += g.attributes.position.count;
                idxCount += g.index ? g.index.count : g.attributes.position.count;
            }
            const pos = new Float32Array(posCount * 3);
            const nor = new Float32Array(posCount * 3);
            const uv = new Float32Array(posCount * 2);
            const idx = new Uint32Array(idxCount);
            let offset = 0, idxOffset = 0;
            for (let i = 0; i < items.length; i++) {
                const g = items[i];
                const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
                pos.set(p.array, offset * 3);
                if (n) nor.set(n.array, offset * 3);
                if (u) uv.set(u.array, offset * 2);
                if (g.index) {
                    for (let j = 0; j < g.index.count; j++) idx[idxOffset + j] = g.index.array[j] + offset;
                    idxOffset += g.index.count;
                } else {
                    for (let j = 0; j < p.count; j++) idx[idxOffset + j] = offset + j;
                    idxOffset += p.count;
                }
                offset += p.count;
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
            geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
            geo.setIndex(new THREE.BufferAttribute(idx, 1));
            return geo;
        }
        // 兼容别名：条纹/花边纹理（与 makeStripeTexture/makeValanceTexture 同功能）
        function stripeTexture(c1, c2, stripes, w, h) { return makeStripeTexture(c1, c2, stripes, w, h); }
        function valanceTexture() { return makeValanceTexture(); }

        /* ==================== 游乐园环境（草地/步道/围栏/路灯/树） ==================== */
        function xformGeo(geo, x, y, z, rx, ry, rz) {
            const m = new THREE.Matrix4();
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0));
            m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
            geo.applyMatrix4(m);
            return geo;
        }
        function buildPark() {
            const park = new THREE.Group();
            const grass = new THREE.Mesh(new THREE.CircleGeometry(30, 48),
                new THREE.MeshStandardMaterial({ color: 0x141433, roughness: 0.9 }));
            grass.rotation.x = -Math.PI / 2; grass.position.y = -0.06;
            park.add(grass);
            const path = new THREE.Mesh(new THREE.RingGeometry(17.5, 21, 48),
                new THREE.MeshStandardMaterial({ color: 0x6e5a35, roughness: 0.85 }));
            path.rotation.x = -Math.PI / 2; path.position.y = 0.02;
            park.add(path);
            const pad1 = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.12, 24),
                new THREE.MeshStandardMaterial({ color: 0xf0e6d2, roughness: 0.8 }));
            pad1.position.set(13, 0.06, 24); park.add(pad1);
            const pad2 = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.2, 0.12, 24),
                new THREE.MeshStandardMaterial({ color: 0xf0e6d2, roughness: 0.8 }));
            pad2.position.set(-20, 0.06, -14); park.add(pad2);
            const postMat = new THREE.MeshStandardMaterial({ color: 0xf6f1e7, roughness: 0.6 });
            const POSTS = 40;
            const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.11, 1.1, 6), postMat, POSTS);
            const m4 = new THREE.Matrix4();
            for (let i = 0; i < POSTS; i++) {
                const a = (i / POSTS) * Math.PI * 2;
                m4.setPosition(Math.cos(a) * 27.2, 0.55, Math.sin(a) * 27.2);
                posts.setMatrixAt(i, m4);
            }
            park.add(posts);
            park.add(new THREE.Mesh(mergeGeoms([
                xformGeo(new THREE.TorusGeometry(27.2, 0.06, 6, 64), 0, 0.9, 0, Math.PI / 2),
                xformGeo(new THREE.TorusGeometry(27.2, 0.06, 6, 64), 0, 0.45, 0, Math.PI / 2)
            ]), postMat));
            const lampPostMat = new THREE.MeshStandardMaterial({ color: 0x3a3550, roughness: 0.5 });
            const lampBulbMat = new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffcc66, emissiveIntensity: 1.6, roughness: 0.4 });
            const lampPosts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 6), lampPostMat, 4);
            const lampBulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 10, 8), lampBulbMat, 4);
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
                m4.setPosition(Math.cos(a) * 22.5, 1.6, Math.sin(a) * 22.5);
                lampPosts.setMatrixAt(i, m4);
                m4.setPosition(Math.cos(a) * 22.5, 3.3, Math.sin(a) * 22.5);
                lampBulbs.setMatrixAt(i, m4);
            }
            park.add(lampPosts, lampBulbs);
            const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.7 });
            const crownMat = new THREE.MeshStandardMaterial({ color: 0x1f4752, roughness: 0.8 });
            const TREES = 8;
            const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 1.2, 6), trunkMat, TREES);
            const crowns1 = new THREE.InstancedMesh(new THREE.ConeGeometry(1.15, 1.7, 8), crownMat, TREES);
            const crowns2 = new THREE.InstancedMesh(new THREE.ConeGeometry(0.85, 1.4, 8), crownMat, TREES);
            for (let i = 0; i < TREES; i++) {
                const a = (i / TREES) * Math.PI * 2 + 0.35;
                const x = Math.cos(a) * 25.5, z = Math.sin(a) * 25.5;
                const sway = (Math.random() - 0.5) * 0.24;   // 随机倾斜 → 梦幻造型树
                const scale = 0.85 + Math.random() * 0.5;
                const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, sway));
                m4.compose(new THREE.Vector3(x, 0.6 * scale, z), q, new THREE.Vector3(scale, scale, scale));
                trunks.setMatrixAt(i, m4);
                m4.compose(new THREE.Vector3(x, 1.9 * scale, z), q, new THREE.Vector3(scale, scale, scale));
                crowns1.setMatrixAt(i, m4);
                m4.compose(new THREE.Vector3(x, 2.9 * scale, z), q, new THREE.Vector3(scale, scale, scale));
                crowns2.setMatrixAt(i, m4);
            }
            park.add(trunks, crowns1, crowns2);
            // 发光小蘑菇 ×10（梦幻夜景点缀）
            const mushStemMat = new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.6 });
            const MUSH = 10;
            const mushStems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.13, 0.7, 6), mushStemMat, MUSH);
            const mushCaps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 10, 8),
                new THREE.MeshStandardMaterial({ roughness: 0.4 }), MUSH);
            const GLOW = [0xff7ab8, 0x7ae0ff, 0xffd0f0, 0x9fb8ff];
            for (let i = 0; i < MUSH; i++) {
                const a = Math.random() * Math.PI * 2;
                const r = 22 + Math.random() * 5;
                const x = Math.cos(a) * r, z = Math.sin(a) * r;
                const s = 0.7 + Math.random() * 0.9;
                m4.compose(new THREE.Vector3(x, 0.35 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
                mushStems.setMatrixAt(i, m4);
                m4.compose(new THREE.Vector3(x, 0.72 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
                mushCaps.setMatrixAt(i, m4);
                mushCaps.setColorAt(i, new THREE.Color(GLOW[i % GLOW.length]));
            }
            mushCaps.instanceColor.needsUpdate = true;
            park.add(mushStems, mushCaps);
            scene.add(park);
        }

        /* ==================== 预留空位（未来项目） ==================== */
        function buildReservedPad(x, z) {
            const pad = new THREE.Group();
            const cream = new THREE.MeshStandardMaterial({ color: 0xf0e6d2, roughness: 0.8 });
            const wood = new THREE.MeshStandardMaterial({ color: 0xa8783c, roughness: 0.6 });
            const platform = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.8, 0.14, 32), cream);
            platform.position.y = 0.07;
            pad.add(platform);
            // 低矮护栏圈
            const rail = new THREE.Mesh(new THREE.TorusGeometry(6.6, 0.08, 6, 48), wood);
            rail.rotation.x = Math.PI / 2; rail.position.y = 0.55;
            pad.add(rail);
            // 立牌：预留区域
            const sc = document.createElement('canvas'); sc.width = 512; sc.height = 256;
            const scx = sc.getContext('2d');
            scx.fillStyle = '#a8783c'; scx.fillRect(0, 0, 512, 256);
            scx.strokeStyle = '#6e4c22'; scx.lineWidth = 14; scx.strokeRect(7, 7, 498, 242);
            scx.fillStyle = '#3a2a14'; scx.font = '72px "KaiTi", "STKaiti", sans-serif';
            scx.textAlign = 'center'; scx.textBaseline = 'middle';
            scx.fillText('敬请期待', 256, 105);
            scx.font = '34px sans-serif'; scx.fillStyle = '#5a4520';
            scx.fillText('NEXT ATTRACTION', 256, 195);
            const signTex = new THREE.CanvasTexture(sc); signTex.encoding = THREE.sRGBEncoding;
            const board = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3),
                new THREE.MeshStandardMaterial({ map: signTex, side: THREE.DoubleSide, roughness: 0.6 }));
            board.position.set(0, 4.1, 0);
            pad.add(board);
            const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 3.2, 8), wood);
            post1.position.set(-1.9, 1.6, 0.05); pad.add(post1);
            const post2 = post1.clone(); post2.position.x = 1.9; pad.add(post2);
            pad.position.set(x, 0.02, z);
            scene.add(pad);
        }

        function buildGachaMachine() {
            gachaGroup = new THREE.Group();
            const machine = new THREE.Group();      // 扭蛋机本体（放进店铺里）
            const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.75, roughness: 0.3 });
            const red = new THREE.MeshStandardMaterial({ color: 0xb8302e, roughness: 0.4 });
            const white = new THREE.MeshStandardMaterial({ color: 0xf6f1e7, roughness: 0.5 });
            const dark = new THREE.MeshStandardMaterial({ color: 0x2a2438, roughness: 0.6 });

            const redParts = [], whiteParts = [];
            const push = (bucket, geo, x, y, z) => {
                geo.applyMatrix4(new THREE.Matrix4().setPosition(x, y, z));
                bucket.push(geo);
            };
            push(redParts, new THREE.CylinderGeometry(1.85, 2.05, 0.5, 24), 0, 0.25, 0);
            push(whiteParts, new THREE.CylinderGeometry(1.5, 1.65, 2.0, 24), 0, 1.5, 0);
            push(redParts, new THREE.CylinderGeometry(1.6, 1.5, 0.18, 24), 0, 2.58, 0);
            push(redParts, new THREE.ConeGeometry(0.9, 0.7, 16), 0, 4.75, 0);
            push(redParts, new THREE.SphereGeometry(0.28, 12, 8), 0, 5.2, 0);
            machine.add(new THREE.Mesh(mergeGeoms(redParts), red));
            machine.add(new THREE.Mesh(mergeGeoms(whiteParts), white));

            const dome = new THREE.Mesh(
                new THREE.SphereGeometry(1.5, 24, 18),
                new THREE.MeshStandardMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide })
            );
            dome.scale.y = 0.92;
            dome.position.y = 3.35;
            machine.add(dome);

            gachaBalls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 12, 10),
                new THREE.MeshStandardMaterial({ roughness: 0.3 }), 14);
            const m4 = new THREE.Matrix4();
            for (let i = 0; i < 14; i++) {
                const a = Math.random() * Math.PI * 2;
                const rr = Math.random() * 0.7;
                m4.compose(
                    new THREE.Vector3(Math.cos(a) * rr, 2.6 + Math.random() * 0.7, Math.sin(a) * rr),
                    new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, 0)),
                    new THREE.Vector3(1, 1, 1)
                );
                gachaBalls.setMatrixAt(i, m4);
                gachaBalls.setColorAt(i, new THREE.Color(CANDY_COLORS[i % CANDY_COLORS.length]));
                ballAlive.push(true);
            }
            machine.add(gachaBalls);

            const chute = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.16, 20), dark);
            chute.rotation.x = Math.PI / 2;
            chute.position.set(0, 0.95, 1.52);
            machine.add(chute);
            const flap = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.62, 0.06), white);
            flap.position.set(0, 0.95, 1.62);
            machine.add(flap);

            gachaKnob = new THREE.Group();
            const knobBody = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 20), gold);
            knobBody.rotation.x = Math.PI / 2;
            const handle = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.22), red);
            handle.position.z = 0.18;
            gachaKnob.add(knobBody, handle);
            gachaKnob.position.set(0, 2.0, 1.56);
            machine.add(gachaKnob);

            machine.position.set(0, 0.18, -1.1);
            machine.scale.setScalar(1.12);
            gachaGroup.add(machine);

            // ===== 扭蛋屋（店铺门面） =====
            const wood = new THREE.MeshStandardMaterial({ color: 0x7a4f28, roughness: 0.7 });
            const woodDark = new THREE.MeshStandardMaterial({ color: 0x5a3a1c, roughness: 0.75 });
            const floor = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.24, 6.6),
                new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.85 }));
            floor.position.y = 0.12;
            gachaGroup.add(floor);
            const backWall = new THREE.Mesh(new THREE.BoxGeometry(9.8, 5.8, 0.3), wood);
            backWall.position.set(0, 2.9, -3.1);
            gachaGroup.add(backWall);
            const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.8, 6.6), wood);
            wallL.position.set(-4.75, 2.9, 0);
            gachaGroup.add(wallL);
            const wallR = wallL.clone(); wallR.position.x = 4.75;
            gachaGroup.add(wallR);
            const stripesV = [];
            for (let i = -3; i <= 3; i++) {
                stripesV.push(xformGeo(new THREE.BoxGeometry(0.06, 5.6, 0.34), i * 1.35, 2.9, 0));
            }
            gachaGroup.add(new THREE.Mesh(mergeGeoms(stripesV), woodDark));

            // 遮阳棚（红白条纹，前倾）
            const awning = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.18, 3.4),
                new THREE.MeshStandardMaterial({ map: makeStripeTexture('#b8302e', '#f5ead0', 10, 512, 128), roughness: 0.55 }));
            awning.position.set(0, 6.1, 1.1);
            awning.rotation.x = 0.16;
            gachaGroup.add(awning);
            const awningFront = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.5, 0.12), red);
            awningFront.position.set(0, 5.62, 2.72);
            gachaGroup.add(awningFront);

            // 招牌：扭蛋屋（手写字体，字体加载后重绘）
            const ssc = document.createElement('canvas'); ssc.width = 512; ssc.height = 160;
            const drawShopSign = () => {
                const sx = ssc.getContext('2d');
                sx.fillStyle = '#141433'; sx.fillRect(0, 0, 512, 160);
                sx.strokeStyle = '#d4af37'; sx.lineWidth = 8; sx.strokeRect(6, 6, 500, 148);
                sx.fillStyle = '#ffe9b0';
                sx.shadowColor = 'rgba(255,200,100,0.5)'; sx.shadowBlur = 16;
                sx.font = '96px "Ma Shan Zheng", "KaiTi", cursive';
                sx.textAlign = 'center'; sx.textBaseline = 'middle';
                sx.fillText('扭 蛋 屋', 256, 84);
                sx.shadowBlur = 0;
            };
            drawShopSign();
            fontReady.then(() => { drawShopSign(); shopSignTex.needsUpdate = true; });
            const shopSignTex = new THREE.CanvasTexture(ssc);
            shopSignTex.encoding = THREE.sRGBEncoding;
            const shopSign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.6),
                new THREE.MeshBasicMaterial({ map: shopSignTex, side: THREE.DoubleSide, toneMapped: false }));
            shopSign.position.set(0, 6.9, 1.3);
            gachaGroup.add(shopSign);

            // 檐下灯串
            const bulbMat2 = new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffcc66, emissiveIntensity: 1.6, roughness: 0.4 });
            const bulbs2 = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 8, 6), bulbMat2, 12);
            for (let i = 0; i < 12; i++) {
                m4.setPosition(-4.5 + i * 0.82, 5.5, 2.6);
                bulbs2.setMatrixAt(i, m4);
            }
            gachaGroup.add(bulbs2);

            // 柜台
            const counter = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.95, 0.8),
                new THREE.MeshStandardMaterial({ color: 0x8a5a2e, roughness: 0.65 }));
            counter.position.set(0, 0.6, 2.3);
            gachaGroup.add(counter);
            const counterTop = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.12, 0.95), white);
            counterTop.position.set(0, 1.13, 2.3);
            gachaGroup.add(counterTop);

            gachaGroup.scale.setScalar(1.15);
            gachaGroup.position.set(13, 0.1, 24);
            gachaGroup.rotation.y = Math.atan2(0 - 13, 47 - 24);
            scene.add(gachaGroup);
        }


        async function loadCarouselModel() {
            const loader = new GLTFLoader();
            const candidates = ['assets/carousel.glb', 'assets/carousel/scene.gltf'];
            for (const url of candidates) {
                try {
                    const gltf = await loader.loadAsync(url);
                    return gltf.scene;
                } catch (e) {
                    console.info('模型候选未命中（继续尝试下一个）:', url);
                }
            }
            return null;
        }

        // 把任意尺寸的模型归一化到场景需要的尺寸，并测量挂钩基准
        function normalizeModel(model) {
            model.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const scale = Math.min(
                TARGET_DIAMETER / Math.max(size.x, size.z, 0.001),
                TARGET_HEIGHT / Math.max(size.y, 0.001)
            );
            model.scale.setScalar(scale);

            box.setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            model.position.x -= center.x;
            model.position.z -= center.z;
            model.position.y -= box.min.y;   // 底部落地

            model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
            carouselGroup.add(model);

            box.setFromObject(model);
            return {
                radius: Math.max(Math.abs(box.max.x), Math.abs(box.min.x), Math.abs(box.max.z), Math.abs(box.min.z)),
                topY: box.max.y
            };
        }

        /* ============================================================
         * 3. 拍立得照片系统
         * ============================================================ */
        const photoTextureLoader = new THREE.TextureLoader();
        const paperBackTexture = (() => {
            const c = document.createElement('canvas'); c.width = c.height = 128;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#efe9dc'; ctx.fillRect(0, 0, 128, 128);
            ctx.fillStyle = 'rgba(120,110,90,0.08)';
            for (let i = 0; i < 60; i++) ctx.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5);
            const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
        })();

        // 画拍立得相纸底（微暖白 + 纸纹 + 内阴影），照片区域由 drawPhoto 决定
        function drawPolaroidCanvas(ctx, W, H, drawPhoto) {
            const grad = ctx.createLinearGradient(0, 0, 0, H);
            grad.addColorStop(0, '#faf7f0'); grad.addColorStop(1, '#f1ecdf');
            ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(120,110,90,0.05)';
            for (let i = 0; i < 220; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 1.4, 1.4);
            drawPhoto(ctx);
            ctx.strokeStyle = 'rgba(60,50,30,0.35)'; ctx.lineWidth = 3;
            ctx.strokeRect(21.5, 21.5, W - 43, H - 152);
        }

        function makePlaceholderTexture() {
            const W = 512, H = 640;
            const c = document.createElement('canvas'); c.width = W; c.height = H;
            const ctx = c.getContext('2d');
            drawPolaroidCanvas(ctx, W, H, (ctx) => {
                ctx.fillStyle = '#2a2438'; ctx.fillRect(22, 22, W - 44, H - 152);
                ctx.strokeStyle = 'rgba(255,230,180,0.35)'; ctx.setLineDash([10, 8]); ctx.lineWidth = 3;
                ctx.strokeRect(52, 52, W - 104, H - 212);
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(255,230,180,0.75)';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.font = '64px system-ui';
                ctx.fillText('＋', W / 2, H / 2 - 34);
                ctx.font = '26px system-ui';
                ctx.fillText('等一张照片', W / 2, H / 2 + 42);
            });
            const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
        }

        function makePhotoTexture(image, nick) {
            const W = 512, H = 640;
            const c = document.createElement('canvas'); c.width = W; c.height = H;
            const ctx = c.getContext('2d');
            drawPolaroidCanvas(ctx, W, H, (ctx) => {
                const px = 22, py = 22, pw = W - 44, ph = H - 152;
                const s = Math.min(image.width, image.height);
                const sx = (image.width - s) / 2, sy = (image.height - s) / 2;
                ctx.drawImage(image, sx, sy, s, s, px, py, pw, ph);
            });
            // 手写昵称（楷体系，微倾斜，像拍立得签名）
            ctx.save();
            ctx.translate(W / 2, H - 58);
            ctx.rotate(-0.035);
            ctx.fillStyle = '#3d3a45';
            ctx.font = 'italic 40px "KaiTi", "Kaiti SC", "STKaiti", "楷体", cursive';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(nick, 0, 0);
            ctx.restore();
            const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
        }

        const ROPE_POINTS = 10;   // 每根丝线的节点数（verlet 软绳）

        // 初始化/重置一根软绳：静止时垂直挂在挂钩正下方
        function initRope(p) {
            const a = anchors[p.slot].anchor;
            const segLen = p.lineLen / (ROPE_POINTS - 1);
            const pts = [];
            for (let i = 0; i < ROPE_POINTS; i++) {
                const pos = new THREE.Vector3(a.x, a.y - segLen * i, a.z);
                pts.push({ pos, prev: pos.clone() });
            }
            p.rope = { pts, segLen };
        }

        function createPolaroid({ texture, slot, real = false, id = null, url = null, dbNick = null }) {
            const { angle, anchor } = anchors[slot];
            const size = PHOTO_MIN + Math.random() * (PHOTO_MAX - PHOTO_MIN);
            const lineLength = LINE_MIN + Math.random() * (LINE_MAX - LINE_MIN);
            const baseTilt = (Math.random() - 0.5) * 0.12;

            const group = new THREE.Group();
            const geo = new THREE.PlaneGeometry(size, size * 1.25);
            const front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
            const back = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: paperBackTexture, toneMapped: false }));
            back.rotation.y = Math.PI;
            group.add(front, back);
            group.rotation.y = Math.PI / 2 - angle;   // 拍立得面朝外侧
            group.rotation.z = baseTilt;
            group.position.set(anchor.x, anchor.y - lineLength - size * 0.625, anchor.z);
            carouselGroup.add(group);

            // 软绳线框（ROPE_POINTS 个节点连成折线）
            const lineGeo = new THREE.BufferGeometry();
            lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ROPE_POINTS * 3), 3));
            const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xccaa88, transparent: true, opacity: 0.75 }));
            carouselGroup.add(line);

            const photo = {
                group, front, back, line, slot, real, id, url,
                nickname: dbNick || nickname,
                size, lineLen: lineLength,
                phase: Math.random() * Math.PI * 2,
                baseTilt, hoverT: 0, hovered: false, dragging: false,
                targetRotY: Math.PI / 2 - angle,
                dragTarget: new THREE.Vector3()
            };
            front.userData.photo = photo; back.userData.photo = photo;
            initRope(photo);
            photos.push(photo);
            updateRopeLine(photo);
            return photo;
        }

        function updateRopeLine(p) {
            const arr = p.line.geometry.attributes.position.array;
            p.rope.pts.forEach((pt, i) => {
                arr[i * 3] = pt.pos.x; arr[i * 3 + 1] = pt.pos.y; arr[i * 3 + 2] = pt.pos.z;
            });
            p.line.geometry.attributes.position.needsUpdate = true;
        }

        function removePolaroid(p) {
            carouselGroup.remove(p.group, p.line);
            p.front.geometry.dispose();
            p.line.geometry.dispose();
            const i = photos.indexOf(p);
            if (i >= 0) photos.splice(i, 1);
        }

        function buildAnchors(dims) {
            anchors.length = 0;
            for (let i = 0; i < SLOT_COUNT; i++) {
                const angle = (i / SLOT_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.1;
                const r = dims.radius * ANCHOR_R_FACTOR;
                const y = dims.topY * ANCHOR_Y_FACTOR;
                anchors.push({ angle, anchor: new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r) });
            }
            carouselReady = true;
        }

        function placeBase() {
            for (let i = 0; i < SLOT_COUNT; i++) {
                createPolaroid({ texture: makePlaceholderTexture(), slot: i, real: false });
            }
        }

        function movePolaroidToSlot(p, slot) {
            p.slot = slot;
            p.targetRotY = Math.PI / 2 - anchors[slot].angle;
            // 不传送软绳：挂钩换位后，约束自然把绳子"荡"到新挂钩下方
        }

        // 数据库/本地的一条照片记录 → 场景
        function applyPhotoRow(row) {
            const exist = photos.find(p => p.real && p.id === row.id);
            if (exist) { movePolaroidToSlot(exist, row.slot); return; }
            const old = photos.find(p => p.slot === row.slot && p.real);
            if (old) removePolaroid(old);
            const placeholder = photos.find(p => p.slot === row.slot && !p.real);
            if (placeholder) removePolaroid(placeholder);
            photoTextureLoader.load(row.url, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                createPolaroid({ texture: tex, slot: row.slot, real: true, id: row.id, url: row.url, dbNick: row.nickname });
            });
        }

        function fillPlaceholder(slot) {
            if (photos.some(p => p.slot === slot)) return;
            createPolaroid({ texture: makePlaceholderTexture(), slot, real: false });
        }

        /* ============================================================
         * 4. 交互：推木马 / 拨照片 / 拖拽交换 / 点击删除
         * ============================================================ */
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const mousePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const mousePoint = new THREE.Vector3();
        let hoverPhoto = null;

        let angularVelocity = 0.3;   // 当前角速度（弧度/秒，与帧率无关）
        const BASE_SPEED = 0.3;      // 基础自转：0.3 弧度/秒 ≈ 21 秒一圈
        const MAX_ANG = 9;           // 推动时的速度上限
        let carouselDrag = false, prevX = 0;
        let downInfo = null;
        let dragPhoto = null, dropTarget = null;

        const raycastPhotos = () => {
            raycaster.setFromCamera(pointer, camera);
            return raycaster.intersectObjects(photos.flatMap(p => [p.front, p.back]), false)[0] || null;
        };

        window.addEventListener('pointermove', (e) => {
            document.documentElement.style.setProperty('--mouse-x', e.clientX + 'px');
            document.documentElement.style.setProperty('--mouse-y', e.clientY + 'px');
            pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
            pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
            spotLight.position.x = pointer.x * 50;
            spotLight.position.y = 40 + pointer.y * 20;
            raycaster.setFromCamera(pointer, camera);
            raycaster.ray.intersectPlane(mousePlane, mousePoint);

            if (!carouselReady) return;

            if (dragPhoto) {
                const localMouse = carouselGroup.worldToLocal(mousePoint.clone());
                const anchorY = anchors[dragPhoto.slot].anchor.y;
                dragPhoto.dragTarget.set(
                    THREE.MathUtils.clamp(localMouse.x, -14, 14),
                    THREE.MathUtils.clamp(localMouse.y, 2.2, anchorY - 0.5),   // 不能拉到挂钩之上
                    THREE.MathUtils.clamp(localMouse.z, -14, 14)
                );
                dragPhoto.group.position.lerp(dragPhoto.dragTarget, 0.4);

                // 落点检测：排除拖拽中的照片自己，否则永远打中自己
                const hitList = raycaster.intersectObjects(
                    photos.flatMap(p => p === dragPhoto ? [] : [p.front, p.back]), false);
                const other = hitList[0] ? hitList[0].object.userData.photo : null;
                if (dropTarget && dropTarget !== other) dropTarget.hovered = false;
                dropTarget = other;
                if (dropTarget) dropTarget.hovered = true;
                document.body.style.cursor = dropTarget ? 'grab' : 'grabbing';
            } else if (downInfo && (Math.abs(e.clientX - downInfo.x) > 8 || Math.abs(e.clientY - downInfo.y) > 8)) {
                if (downInfo.photo && canMutate()) {
                    dragPhoto = downInfo.photo;
                    dragPhoto.dragging = true;
                    dragPhoto.dragTarget.copy(dragPhoto.group.position);
                    document.body.style.cursor = 'grabbing';
                } else if (!downInfo.photo) {
                    carouselDrag = true; prevX = e.clientX;
                }
                downInfo = null;
            } else if (carouselDrag) {
                const deltaX = e.clientX - prevX;
                angularVelocity = THREE.MathUtils.clamp(angularVelocity + deltaX * 0.03, -MAX_ANG, MAX_ANG);
                prevX = e.clientX;
            } else {
                const hit = raycastPhotos();
                const p = hit ? hit.object.userData.photo : null;
                if (hoverPhoto && hoverPhoto !== p) hoverPhoto.hovered = false;
                hoverPhoto = p;
                if (p) p.hovered = true;
                document.body.style.cursor = p ? 'pointer' : 'default';
            }
        });

    window.addEventListener('pointerdown', (e) => {
        if (e.target.closest && e.target.closest('#controls, #confirm-chip, #toast, #title-card, #note-modal, #egg-modal')) return;
        tryStartMusic();
        if (!carouselReady) return;
        pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        // 视图路由：全景点设施进入特写；特写视图内各归各位
        if (gachaGroup && raycaster.intersectObject(gachaGroup, true).length) {
            if (camMode === 'gacha') { twistGacha(); return; }
            flyTo('gacha');
            return;
        }
        if (camMode === 'overview') {
            if (raycaster.intersectObject(carouselGroup, true).length) flyTo('carousel');
            return;   // 点空地/天空无操作
        }
        if (camMode !== 'carousel') return;
        const hit = raycastPhotos();
        downInfo = { x: e.clientX, y: e.clientY, t: performance.now(), photo: hit ? hit.object.userData.photo : null };
        if (!downInfo.photo) { carouselDrag = true; prevX = e.clientX; }
    });

        window.addEventListener('pointerup', (e) => {
            if (dragPhoto) {
                if (dropTarget) swapPhotos(dragPhoto, dropTarget);
                if (dropTarget) dropTarget.hovered = false;
                dragPhoto.dragging = false;
                dragPhoto = null; dropTarget = null;
                document.body.style.cursor = 'default';
            } else if (downInfo && performance.now() - downInfo.t < 400 &&
                       Math.abs(e.clientX - downInfo.x) < 6 && Math.abs(e.clientY - downInfo.y) < 6) {
                if (downInfo.photo && downInfo.photo.real) askDelete(downInfo.photo);
            }
            carouselDrag = false; downInfo = null;
        });

        function canMutate() {
            // 公共入口页任何人都能上传（各自生成专属相册）；专属相册只有主人能操作
            return cloud ? (mode === 'album' ? isOwner : true) : true;
        }

        /* ---------- 交换位置 ---------- */
        async function swapPhotos(a, b) {
            const sa = a.slot, sb = b.slot;
            movePolaroidToSlot(a, sb);
            movePolaroidToSlot(b, sa);
            if (!cloud) { toast('🔄 交换成功'); return; }
            const { error } = await cloud.rpc('swap_photos', { p_a: a.id, p_b: b.id, p_owner: visitorId });
            if (error) {
                toast('交换同步失败：' + error.message);
                movePolaroidToSlot(a, sa); movePolaroidToSlot(b, sb);
            } else {
                toast('🔄 交换成功，所有人都会看到');
            }
        }

        /* ---------- 删除 ---------- */
        let pendingDelete = null;
        function askDelete(p) {
            if (!canMutate()) return;
            pendingDelete = p;
            document.getElementById('confirm-text').textContent = `删除 ${p.nickname} 的这张照片？`;
            document.getElementById('confirm-chip').classList.add('show');
        }
        document.getElementById('confirm-no').onclick = () => {
            pendingDelete = null;
            document.getElementById('confirm-chip').classList.remove('show');
        };
        document.getElementById('confirm-yes').onclick = async () => {
            const p = pendingDelete;
            document.getElementById('confirm-chip').classList.remove('show');
            pendingDelete = null;
            if (!p) return;
            if (!cloud) { removePolaroid(p); fillPlaceholder(p.slot); toast('已删除（本地演示）'); return; }
            try {
                const { data: path, error } = await cloud.rpc('delete_photo', { p_id: p.id, p_owner: visitorId });
                if (error) { toast('删除失败：' + error.message); return; }
                if (path) cloud.storage.from('media').remove([path]);
                removePolaroid(p); fillPlaceholder(p.slot);
                toast('🗑️ 已删除');
            } catch (err) { toast('删除失败：' + err.message); }
        };

        /* ============================================================
         * 5. 数据层：本地演示 / Supabase 云
         * ============================================================ */
        async function initCloud() {
            if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
            // 优先使用本地打包的 UMD 版（随仓库分发，无 CDN 依赖）
            if (window.supabase && typeof window.supabase.createClient === 'function') {
                return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            }
            const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
            return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }

        // 网络不稳时自动重试（间隔递增）
        async function withRetry(fn, n = 3, label = '') {
            let lastErr;
            for (let i = 1; i <= n; i++) {
                try { return await fn(); }
                catch (e) {
                    lastErr = e;
                    if (i < n) await new Promise(r => setTimeout(r, 800 * i));
                }
            }
            throw lastErr;
        }

        function resetWall() {
            [...photos].forEach(removePolaroid);
            placeBase();
        }

        // 加载一个专属相册（照片 + 实时订阅 + 音乐）；找不到返回 false
        async function loadAlbum(g) {
            const { data: album } = await cloud.from('albums').select('*').eq('id', g).single();
            if (!album) return false;
            mode = 'album'; albumId = g;
            isOwner = album.owner_id === visitorId;
            resetWall();
            const { data: rows } = await cloud.from('photos').select('*').eq('album_id', g).order('slot');
            (rows || []).forEach(applyPhotoRow);
            await loadNotes(g);
            subscribeRealtime(g);
            if (album.music_url) setMusic(album.music_url);
            return true;
        }

        async function boot() {
            setStatus('正在加载八音盒…', true);
            const model = await loadCarouselModel();
            carouselDims = model ? normalizeModel(model) : buildProceduralCarousel();
            buildPark();               // 游乐园地面/围栏/路灯/树
            buildGate();               // 游乐园大门
            buildGachaMachine();       // 设施一：扭蛋机摊位
            buildReservedPad(-20, -14);   // 预留空位（未来项目）
            buildReservedPad(18, -20);    // 预留空位（未来项目）
            buildAnchors(carouselDims);
            document.getElementById('loading').classList.add('hide');

            cloud = await initCloud();
            // 分享链接经常被聊天软件截断或粘上标点（如「?g=abc12。」），这里自动清洗。
            // 同时支持更短的哈希格式：网址末尾 #编号
            let g = new URLSearchParams(location.search).get('g');
            if (!g && location.hash.length > 1) g = location.hash.slice(1);
            if (g) g = g.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || null;

            if (cloud && g) {
                const ok = await loadAlbum(g);
                if (!ok) {
                    toast(`链接里的相册「${g}」不存在——让分享的人检查链接，或在左上角输入相册编号`);
                    placeBase();
                }
            } else {
                // 公共网址只是"入口"：不挂任何人的照片；
                // 每个人在这里上传时会自动生成自己的专属相册和链接
                placeBase();
                notes = []; noteBag = []; lastNoteId = null;
            }
            refreshUI();
        }

        function subscribeRealtime(g) {
            cloud.channel('album-' + g)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'photos', filter: `album_id=eq.${g}` }, (payload) => {
                    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') applyPhotoRow(payload.new);
                    if (payload.eventType === 'DELETE') {
                        const p = photos.find(x => x.real && x.id === payload.old.id);
                        if (p) { removePolaroid(p); fillPlaceholder(p.slot); }
                    }
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `album_id=eq.${g}` }, (payload) => {
                    if (payload.eventType === 'INSERT') {
                        if (!notes.some(x => x.id === payload.new.id)) notes.push(payload.new);
                        shuffleBag();
                    }
                    if (payload.eventType === 'DELETE') {
                        notes = notes.filter(x => x.id !== payload.old.id);
                    }
                })
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'albums', filter: `id=eq.${g}` }, (payload) => {
                    if (payload.new.music_url && payload.new.music_url !== currentMusicUrl) setMusic(payload.new.music_url);
                })
                .subscribe();
        }

        /* ---------- 上传照片 ---------- */
        async function compressImage(file, max = 720, quality = 0.85) {
            const bmp = await createImageBitmap(file);
            const s = Math.min(bmp.width, bmp.height);
            const c = document.createElement('canvas'); c.width = c.height = max;
            c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, max, max);
            bmp.close?.();
            return await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
        }

        // 创建/复用专属相册：每台浏览器固定绑定一个相册，所有上传都进同一个，
        // 分享链接长期有效（避免"每次上传新建相册"导致照片分散、旧照片不在链接里）
        async function ensureAlbum() {
            if (mode === 'album') return;
            const stored = localStorage.getItem('car_my_album');
            if (stored && await loadAlbum(stored)) {
                history.replaceState(null, '', location.pathname + '?g=' + albumId);
                refreshUI();
                return;
            }
            albumId = Array.from(crypto.getRandomValues(new Uint8Array(5)))
                .map(b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
            const { error } = await withRetry(() =>
                cloud.rpc('create_album', { p_id: albumId, p_owner: visitorId }));
            if (error) { toast('创建相册失败：' + error.message); throw error; }
            localStorage.setItem('car_my_album', albumId);
            mode = 'album'; isOwner = true;
            history.replaceState(null, '', location.pathname + '?g=' + albumId);
            resetWall();
            notes = []; noteBag = []; lastNoteId = null;   // 新相册扭蛋机是空的
            subscribeRealtime(albumId);
            refreshUI();
        }

        async function handlePhotoFiles(fileList) {
            const files = [...fileList].filter(f => f.type.startsWith('image/'));
            if (!files.length) return;
            toast('正在上传…');
            for (const file of files) {
                try {
                    const blob = await compressImage(file);
                    if (!cloud) {
                        // 本地演示模式：真实照片占用挂钩，占位图不算数。
                        // 找第一个没有"真实照片"的挂钩；12 个全被真实照片占满则替换最早的一张
                        const reals = photos.filter(p => p.real);
                        let slot = -1;
                        for (let i = 0; i < SLOT_COUNT; i++) {
                            if (!reals.some(p => p.slot === i)) { slot = i; break; }
                        }
                        if (slot < 0) {
                            const oldest = reals.sort((a, b) => a.id - b.id)[0];
                            slot = oldest.slot; removePolaroid(oldest);
                        }
                        const ph = photos.find(p => p.slot === slot && !p.real);
                        if (ph) removePolaroid(ph);
                        const bmp = await createImageBitmap(file);
                        createPolaroid({ texture: makePhotoTexture(bmp, nickname), slot, real: true, id: Date.now() + Math.random() });
                        bmp.close?.();
                        continue;
                    }
                    await ensureAlbum();   // 上传即自动创建你的专属相册，网址随之切换
                    const path = `${albumId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
                    const up = await withRetry(() =>
                        cloud.storage.from('media').upload(path, blob, { contentType: 'image/jpeg' }));
                    if (up.error) { toast('上传失败：' + up.error.message); continue; }
                    const url = cloud.storage.from('media').getPublicUrl(path).data.publicUrl;
                    const { data: added, error } = await withRetry(() =>
                        cloud.rpc('add_photo', {
                            p_album: albumId, p_owner: visitorId, p_url: url, p_path: path, p_nickname: nickname
                        }));
                    if (error) { toast('保存失败：' + error.message); continue; }
                    // 服务端轮换替换掉的旧照片 → 顺手清掉存储文件
                    if (added && added.replaced_path) cloud.storage.from('media').remove([added.replaced_path]);
                    applyPhotoRow({ id: Number(added.id), slot: added.slot, url, nickname, album_id: albumId });
                } catch (err) {
                    toast('上传出错：' + err.message);
                }
            }
            refreshUI();
        }

        /* ---------- 更换音乐 ---------- */
        const audio = new Audio(); audio.loop = true;
        let wantMusic = localStorage.getItem('car_music') !== 'off';
        let currentMusicUrl = null;

        function setMusic(src, label) {
            currentMusicUrl = src;
            audio.src = src;
            const btn = document.getElementById('btn-music');
            btn.textContent = label ? `🎵 ${label}` : '🎵 已选音乐';
            if (wantMusic) tryStartMusic();
        }
        function tryStartMusic() {
            if (!wantMusic || !audio.src) return;
            audio.play().catch(() => {
                // 浏览器自动播放策略：需要一次用户交互
                toast('点一下页面任意位置，音乐就会开始播放');
            });
        }
        function refreshMuteBtn() {
            document.getElementById('btn-mute').textContent = wantMusic ? '🔊 音乐开' : '🔇 音乐关';
        }
        document.getElementById('btn-mute').onclick = () => {
            if (!audio.src) { toast('还没有背景音乐——先点「🎵 更换音乐」选一首吧'); return; }
            wantMusic = !wantMusic;
            localStorage.setItem('car_music', wantMusic ? 'on' : 'off');
            if (wantMusic) tryStartMusic(); else audio.pause();
            refreshMuteBtn();
        };
        refreshMuteBtn();

        async function handleMusicFile(file) {
            if (!file) return;
            const label = file.name.length > 12 ? file.name.slice(0, 10) + '…' : file.name;
            if (!cloud) {
                setMusic(URL.createObjectURL(file), label);
                toast(`🎵 正在播放：${label}（本地演示，只有你自己能听到）`);
                return;
            }
            // 音乐跟着相册走：公共入口页选的音乐只在自己浏览器里试听；
            // 进入专属相册后选的音乐才会保存并分享给访客
            if (mode !== 'album' || !isOwner) {
                setMusic(URL.createObjectURL(file), label);
                toast(`🎵 正在试听：${label}（进入专属相册后更换才能保存分享）`);
                return;
            }
            try {
                const path = `music/${albumId}/bgm`;
                const up = await withRetry(() =>
                    cloud.storage.from('media').upload(path, file, { upsert: true }));
                if (up.error) { toast('音乐上传失败：' + up.error.message); return; }
                const url = cloud.storage.from('media').getPublicUrl(path).data.publicUrl;
                const { error } = await withRetry(() =>
                    cloud.rpc('set_album_music', { p_album: albumId, p_owner: visitorId, p_url: url }));
                if (error) { toast('音乐保存失败：' + error.message); return; }
                setMusic(url, label);
                toast('🎵 音乐已更换，打开这个网址的人都会听到这首');
            } catch (err) { toast('音乐出错：' + err.message); }
        }

        /* ============================================================
         * 5.5 扭蛋机 · 纸条
         * ============================================================ */
        function shuffleBag() {
            noteBag = notes.map(n => n.id);
            for (let i = noteBag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const t = noteBag[i]; noteBag[i] = noteBag[j]; noteBag[j] = t;
            }
        }
        function pickNote() {
            if (!notes.length) return null;
            if (!noteBag.length) shuffleBag();
            let id = noteBag.pop();
            if (id === lastNoteId && noteBag.length) { noteBag.unshift(id); id = noteBag.pop(); }
            lastNoteId = id;
            return notes.find(n => n.id === id) || null;
        }
        async function loadNotes(g) {
            const { data: rows } = await cloud.from('notes').select('*').eq('album_id', g).order('created_at');
            notes = rows || [];
            shuffleBag();
        }

        // 牛皮纸纸条（做旧风）：撕边牛皮纸 + 手写体 + 胶带 + 日期
        function makeNoteCanvas(note) {
            return new Promise(async (resolve) => {
                try { await fontReady; } catch (e) { /* 忽略 */ }
                const W = 720, H = 920;
                const c = document.createElement('canvas'); c.width = W; c.height = H;
                const ctx = c.getContext('2d');
                const px = 26, py = 26, pw = W - 52, ph = H - 52;

                // ---- 做旧牛皮纸底（撕边 + 阴影） ----
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
                ctx.beginPath();
                const jagX = (n) => Array.from({ length: n + 1 }, () => (Math.random() - 0.5) * 7);
                const topJ = jagX(16), botJ = jagX(16);
                ctx.moveTo(px + topJ[0], py);
                for (let i = 0; i < 16; i++) ctx.lineTo(px + (pw / 16) * i, py + (i % 2 ? -3 : 3));
                ctx.lineTo(px + pw + botJ[16], py);
                for (let i = 0; i < 20; i++) ctx.lineTo(px + pw + (i % 2 ? 4 : -4), py + (ph / 20) * i);
                ctx.lineTo(px + pw, py + ph);
                for (let i = 16; i >= 0; i--) ctx.lineTo(px + (pw / 16) * i, py + ph + (i % 2 ? 3 : -3));
                ctx.lineTo(px, py + ph);
                for (let i = 20; i >= 0; i--) ctx.lineTo(px + (i % 2 ? 4 : -4), py + (ph / 20) * i);
                ctx.closePath();
                const kg = ctx.createLinearGradient(0, 0, W, H);
                kg.addColorStop(0, '#c9a26a'); kg.addColorStop(0.5, '#bb9257'); kg.addColorStop(1, '#a8834e');
                ctx.fillStyle = kg;
                ctx.fill();
                ctx.restore();

                // ---- 牛皮纸纹理：噪点 + 纤维 + 污渍 + 折痕（裁剪在纸内） ----
                ctx.save();
                ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
                ctx.fillStyle = 'rgba(90,60,20,0.10)';
                for (let i = 0; i < 500; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 2.2, 2.2);
                ctx.strokeStyle = 'rgba(255,230,180,0.07)';
                for (let i = 0; i < 26; i++) {
                    const fy = Math.random() * H;
                    ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(W, fy + (Math.random() - 0.5) * 8); ctx.stroke();
                }
                for (let i = 0; i < 3; i++) {
                    const sx2 = Math.random() * W, sy2 = Math.random() * H, r = 40 + Math.random() * 70;
                    const sg = ctx.createRadialGradient(sx2, sy2, 0, sx2, sy2, r);
                    sg.addColorStop(0, 'rgba(90,55,15,0.14)'); sg.addColorStop(1, 'rgba(90,55,15,0)');
                    ctx.fillStyle = sg; ctx.fillRect(sx2 - r, sy2 - r, r * 2, r * 2);
                }
                ctx.strokeStyle = 'rgba(70,45,15,0.10)'; ctx.lineWidth = 3;
                for (const fy of [H * 0.34, H * 0.66]) {
                    ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(W, fy + 6); ctx.stroke();
                }
                ctx.restore();

                // ---- 和纸胶带 ×2 ----
                const tape = (tx2, ty2, rot, color) => {
                    ctx.save();
                    ctx.translate(tx2, ty2); ctx.rotate(rot);
                    ctx.fillStyle = color;
                    ctx.fillRect(-85, -22, 170, 44);
                    ctx.fillStyle = 'rgba(255,255,255,0.28)';
                    ctx.fillRect(-85, -8, 170, 5);
                    ctx.restore();
                };
                tape(px + 88, py + 12, -0.16, 'rgba(214,120,110,0.72)');
                tape(px + pw - 88, py + 12, 0.14, 'rgba(160,190,220,0.6)');

                // ---- 日期 + 昵称 ----
                const d = new Date();
                ctx.fillStyle = '#4a3421';
                ctx.font = '34px "Ma Shan Zheng", "KaiTi", cursive';
                ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
                ctx.fillText(d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日', px + 56, py + 96);
                ctx.textAlign = 'right';
                ctx.font = '30px "Ma Shan Zheng", "KaiTi", cursive';
                ctx.fillStyle = 'rgba(74,52,33,0.85)';
                ctx.fillText(note.nickname || '', px + pw - 50, py + ph - 40);

                // ---- 内容 ----
                const ink = '#43301a';
                ctx.fillStyle = ink;
                ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
                const lineH = 84, tx0 = px + 60, ty0 = py + 200;

                if (note.kind === 'image' && note.url) {
                    // 照片：白色相框贴纸（微旋转 + 阴影）
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        ctx.save();
                        ctx.translate(px + pw / 2, py + 430);
                        ctx.rotate(-0.035);
                        ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
                        ctx.fillStyle = '#f8f4ea';
                        const fw = 460, fh = 420;
                        ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
                        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
                        const s = Math.min(img.width / (fw - 40), img.height / (fh - 70));
                        const sw2 = (fw - 40) * s, sh2 = (fh - 70) * s;
                        ctx.drawImage(img, (img.width - sw2) / 2, (img.height - sh2) / 2, sw2, sh2, -fw / 2 + 20, -fh / 2 + 20, fw - 40, fh - 70);
                        ctx.restore();
                        ctx.fillStyle = ink;
                        ctx.font = '38px "Ma Shan Zheng", "KaiTi", cursive';
                        ctx.textAlign = 'center';
                        ctx.fillText('（这张照片，也留在了扭蛋里）', px + pw / 2, py + ph - 96);
                        resolve(c);
                    };
                    img.onerror = () => resolve(c);
                    img.src = note.url;
                } else {
                    // 打字：手写体逐行
                    ctx.font = '46px "Ma Shan Zheng", "KaiTi", cursive';
                    const text = note.content || '';
                    let x = tx0, y = ty0 + 60, line = '';
                    for (const ch of text) {
                        if (ch === '\n') { ctx.fillText(line, x, y); y += lineH; line = ''; continue; }
                        if (ctx.measureText(line + ch).width > pw - 120) {
                            ctx.fillText(line, x, y); y += lineH; line = ch;
                        } else line += ch;
                    }
                    if (line) ctx.fillText(line, x, y);
                    resolve(c);
                }
            });
        }
        function showEggModal(note) {
            const modal = document.getElementById('egg-modal');
            const delBtn = document.getElementById('egg-delete');
            const paper = document.getElementById('egg-paper');
            paper.style.display = 'none';
            modal.classList.add('show');
            makeNoteCanvas(note).then((canvas) => {
                paper.src = canvas.toDataURL('image/png');
                paper.style.display = 'block';
            });
            delBtn.classList.toggle('show', note.uploader_id === visitorId);
            delBtn.onclick = async () => {
                try {
                    await withRetry(() => cloud.rpc('delete_note', { p_id: note.id, p_owner: visitorId }));
                    modal.classList.remove('show');
                    toast('🗑️ 纸条已删除');
                } catch (e) { toast('删除失败：' + e.message); }
            };
            document.getElementById('egg-again').onclick = () => {
                modal.classList.remove('show');
                setTimeout(twistGacha, 300);
            };
        }

        function twistGacha() {
            if (gachaTwisting) return;
            if (!cloud) { toast('配置 Supabase 后扭蛋机才能装纸条'); return; }
            if (!notes.length) { toast('🍬 扭蛋机还是空的——点「加纸条」放一张进去'); return; }
            const note = pickNote();
            if (!note) return;
            // 扭蛋音效（WebAudio 合成：两声咔哒 + 一声叮）
            try {
                window.__gachaAudio = window.__gachaAudio || new (window.AudioContext || window.webkitAudioContext)();
                const actx = window.__gachaAudio;
                if (actx.state === 'suspended') actx.resume();
                const blip = (freq, delay, dur, vol) => {
                    const o = actx.createOscillator(), g = actx.createGain();
                    o.type = 'square'; o.frequency.value = freq;
                    g.gain.setValueAtTime(vol, actx.currentTime + delay);
                    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + delay + dur);
                    o.connect(g); g.connect(actx.destination);
                    o.start(actx.currentTime + delay); o.stop(actx.currentTime + delay + dur);
                };
                blip(180, 0, 0.07, 0.15); blip(180, 0.3, 0.07, 0.15); blip(1320, 0.95, 0.5, 0.12);
            } catch (e) { /* 音效失败不影响功能 */ }
            gachaTwisting = true;
            gachaAnim = { phase: 'twist', t0: clock.getElapsedTime(), note };
        }

        function updateGachaAnim(time) {
            if (!gachaAnim) return;
            const t = time - gachaAnim.t0;
            if (gachaAnim.phase === 'twist') {
                const k = Math.min(t / 0.7, 1);
                if (gachaKnob) gachaKnob.rotation.y = (1 - Math.pow(1 - k, 2)) * Math.PI * 2;
                if (k >= 1) {
                    for (let i = 0; i < ballAlive.length; i++) {
                        if (ballAlive[i]) {
                            ballAlive[i] = false;
                            gachaBalls.setMatrixAt(i, new THREE.Matrix4().makeScale(0.001, 0.001, 0.001));
                            gachaBalls.instanceMatrix.needsUpdate = true;
                            break;
                        }
                    }
                    gachaEgg = new THREE.Mesh(
                        new THREE.SphereGeometry(0.36, 20, 14),
                        new THREE.MeshStandardMaterial({ color: CANDY_COLORS[Math.floor(Math.random() * CANDY_COLORS.length)], roughness: 0.25, metalness: 0.1 })
                    );
                    gachaEgg.position.set(0, 1.3, 1.1);
                    gachaGroup.add(gachaEgg);
                    gachaAnim.phase = 'drop';
                    gachaAnim.t0 = time;
                }
            } else if (gachaAnim.phase === 'drop') {
                const tt = Math.min(t / 0.9, 1);
                const z = 1.1 + tt * 1.0;
                let y = 1.25 + (0.42 - 1.25) * tt + Math.abs(Math.sin(tt * Math.PI * 2)) * (1 - tt) * 0.35;
                gachaEgg.position.set(0, y, z);
                gachaEgg.rotation.x = tt * 6;
                if (tt >= 1) {
                    const note = gachaAnim.note;
                    gachaGroup.remove(gachaEgg); gachaEgg = null;
                    gachaAnim = null; gachaTwisting = false;
                    showEggModal(note);
                }
            }
        }

        function dataUrlToBlob(dataUrl) {
            const parts = dataUrl.split(',');
            const mime = parts[0].match(/:(.*?);/)[1];
            const bin = atob(parts[1]);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return new Blob([arr], { type: mime });
        }

        async function saveNoteText(content) {
            await ensureAlbum();
            const { data: newId, error } = await withRetry(() =>
                cloud.rpc('add_note', { p_album: albumId, p_owner: visitorId, p_kind: 'text', p_content: content, p_url: null, p_path: null }));
            if (error) { toast('纸条保存失败：' + error.message); return; }
            notes.push({ id: Number(newId), kind: 'text', content, url: null, uploader_id: visitorId });
            shuffleBag();
            toast('🍬 纸条已放进扭蛋机');
        }
        async function saveNoteImage(file) {
            toast('正在把照片印到纸条上…');
            await ensureAlbum();
            const dataUrl = await compressImage(file, 720, 0.85);
            const path = `notes/${albumId}/${Date.now()}.jpg`;
            const up = await withRetry(() =>
                cloud.storage.from('media').upload(path, dataUrlToBlob(dataUrl), { contentType: 'image/jpeg' }));
            if (up.error) { toast('照片上传失败：' + up.error.message); return; }
            const url = cloud.storage.from('media').getPublicUrl(path).data.publicUrl;
            const { data: newId, error } = await withRetry(() =>
                cloud.rpc('add_note', { p_album: albumId, p_owner: visitorId, p_kind: 'image', p_content: null, p_url: url, p_path: path }));
            if (error) { toast('纸条保存失败：' + error.message); return; }
            notes.push({ id: Number(newId), kind: 'image', content: null, url, uploader_id: visitorId });
            shuffleBag();
            toast('🍬 照片纸条已放进扭蛋机');
        }

        /* ============================================================
         * 6. UI
         * ============================================================ */
        function setStatus(text, off = false) {
            const chip = document.getElementById('status-chip');
            chip.textContent = text;
            chip.classList.toggle('off', off);
        }
        function refreshUI() {
            const btnUpload = document.getElementById('btn-upload');
            const btnMusic = document.getElementById('btn-music');
            const btnShare = document.getElementById('btn-share');
            const btnAlbum = document.getElementById('btn-album');
            const btnNote = document.getElementById('btn-note');
            const btnOverview = document.getElementById('btn-overview');
            const modeLine = document.getElementById('mode-line');
            [btnUpload, btnMusic, btnShare, btnAlbum, btnNote, btnOverview].forEach(b => b.classList.remove('show'));

            if (!cloud) {
                setStatus('本地演示模式（未配置 Supabase）', true);
                modeLine.textContent = '公共木马 · 本地演示：照片刷新后消失';
                btnUpload.classList.add('show'); btnMusic.classList.add('show');
            } else if (mode === 'base') {
                // 公共入口页：上传会自动生成你的专属相册和链接
                document.getElementById('code-entry').classList.add('show');
                setStatus('已连接云 · 公共木马');
                modeLine.textContent = '公共木马 · 上传照片后会生成你的专属链接';
                btnUpload.classList.add('show'); btnMusic.classList.add('show');
                btnAlbum.classList.add('show'); btnNote.classList.add('show');
            } else if (isOwner) {
                setStatus('我的相册 · 可编辑');
                modeLine.textContent = `我的专属相册 · 相册编号 ${albumId}`;
                btnUpload.classList.add('show'); btnMusic.classList.add('show'); btnShare.classList.add('show');
                btnNote.classList.add('show');
                document.getElementById('code-entry').classList.remove('show');
            } else {
                setStatus('访客模式 · 只能看');
                modeLine.textContent = `朋友的专属相册（编号 ${albumId}）· 尽情推木马、拨照片吧`;
                document.getElementById('code-entry').classList.remove('show');
            }
            // 视图文案与返回按钮
            if (camMode === 'overview') {
                modeLine.textContent = mode === 'album'
                    ? `你的专属游乐园（编号 ${albumId}）· 点击旋转木马或扭蛋机进入`
                    : '游乐园全景 · 点击旋转木马或扭蛋机进入';
            } else {
                btnOverview.classList.add('show');
            }
        }

        let toastTimer = null;
        function toast(msg) {
            const t = document.getElementById('toast');
            t.textContent = msg; t.classList.add('show');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
        }

        document.getElementById('btn-upload').onclick = () => document.getElementById('file-photo').click();
        document.getElementById('file-photo').onchange = (e) => { handlePhotoFiles(e.target.files); e.target.value = ''; };
        document.getElementById('btn-music').onclick = () => document.getElementById('file-music').click();
        document.getElementById('file-music').onchange = (e) => { handleMusicFile(e.target.files[0]); e.target.value = ''; };
        document.getElementById('btn-album').onclick = async () => {
            if (!cloud) { toast('配置 Supabase 后才能创建专属相册'); return; }
            await ensureAlbum();
            toast('🎁 专属相册已创建！上传照片后把链接发给朋友吧');
        };
        // 扭蛋机：加纸条（主人）与纸条弹层
        document.getElementById('btn-note').onclick = async () => {
            if (!cloud) { toast('配置 Supabase 后扭蛋机才能装纸条'); return; }
            await ensureAlbum();
            document.getElementById('note-choice').style.display = 'block';
            document.getElementById('note-text-view').style.display = 'none';
            document.getElementById('note-modal').classList.add('show');
        };
        document.getElementById('note-cancel').onclick = () => document.getElementById('note-modal').classList.remove('show');
        document.getElementById('note-add-image').onclick = () => document.getElementById('file-note').click();
        document.getElementById('file-note').onchange = async (e) => {
            const file = e.target.files[0]; e.target.value = '';
            document.getElementById('note-modal').classList.remove('show');
            if (file) await saveNoteImage(file);
        };
        document.getElementById('note-add-text').onclick = () => {
            document.getElementById('note-choice').style.display = 'none';
            document.getElementById('note-text-view').style.display = 'block';
            document.getElementById('note-text').value = '';
        };
        document.getElementById('note-text-cancel').onclick = () => {
            document.getElementById('note-choice').style.display = 'block';
            document.getElementById('note-text-view').style.display = 'none';
        };
        document.getElementById('note-text').addEventListener('input', (e) => {
            // 实时预览手写纸条
            makeNoteCanvas({ kind: 'text', content: e.target.value, nickname: nickname }).then((canvas) => {
                const pv = document.getElementById('note-preview');
                pv.getContext('2d').drawImage(canvas, 0, 0, pv.width, pv.height);
            });
        });
        document.getElementById('note-save').onclick = async () => {
            const text = document.getElementById('note-text').value.trim();
            if (!text) { toast('先写点什么吧'); return; }
            await saveNoteText(text);
            document.getElementById('note-modal').classList.remove('show');
        };
        document.getElementById('egg-close').onclick = () => document.getElementById('egg-modal').classList.remove('show');
        // 备用入口：手动输入相册编号（链接被聊天软件截断时用）
        const openCode = () => {
            const code = document.getElementById('album-code').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!code) { toast('先输入 5 位相册编号（分享的人可以在页面左上角看到）'); return; }
            location.href = location.pathname + '?g=' + code;
        };
        document.getElementById('btn-open-code').onclick = openCode;
        document.getElementById('album-code').addEventListener('keydown', e => { if (e.key === 'Enter') openCode(); });
        document.getElementById('btn-share').onclick = async () => {
            try { await navigator.clipboard.writeText(location.href); }
            catch {
                const ta = document.createElement('textarea');
                ta.value = location.href; document.body.appendChild(ta); ta.select();
                document.execCommand('copy'); ta.remove();
            }
            toast(mode === 'album'
                ? `🔗 链接已复制！如果朋友打不开，让TA打开首页输入相册编号 ${albumId}`
                : '🔗 链接已复制，发给朋友吧！');
        };

        /* ============================================================
         * 7. 光斑粒子（跟随鼠标气流）
         * ============================================================ */
        const particleCount = 150;
        const particlesGeometry = new THREE.BufferGeometry();
        const particlePositions = new Float32Array(particleCount * 3);
        const particleData = [];
        for (let i = 0; i < particleCount; i++) {
            particlePositions[i * 3] = (Math.random() - 0.5) * 80;
            particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 40 + 15;
            particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 80;
            particleData.push({ speedY: Math.random() * 0.02 + 0.01, speedX: (Math.random() - 0.5) * 0.02 });
        }
        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
        const particleSystem = new THREE.Points(particlesGeometry, new THREE.PointsMaterial({
            color: 0xffdd88, size: 0.6, transparent: true, opacity: 0.6,
            blending: THREE.AdditiveBlending, depthWrite: false
        }));
        scene.add(particleSystem);

        /* ============================================================
         * 8. 动画主循环
         * ============================================================ */
        const clock = new THREE.Clock();
        const tmpV = new THREE.Vector3();
        const tmpDir = new THREE.Vector3();
        const tmpClosest = new THREE.Vector3();
        const tmpMat4 = new THREE.Matrix4();

        // 物理更新（与渲染分离，便于测试与未来扩展）
        const ROPE_DT = 1 / 60;      // 软绳固定步长：与帧率无关，低帧率时每帧补跑多步
        let ropeAccum = 0, ropeTime = 0;

        function stepRopes(t) {
            // —— 软绳物理（verlet）：绳子可被拨弯，照片像钟摆挂在绳端 ——
            carouselGroup.updateMatrixWorld(true);
            const rayLocal = raycaster.ray.clone().applyMatrix4(tmpMat4.copy(carouselGroup.matrixWorld).invert());
            const DT2 = ROPE_DT * ROPE_DT;
            for (const p of photos) {
                const pts = p.rope.pts, n = pts.length, a = anchors[p.slot].anchor;

                // ① 受力 + verlet 积分：绳节点轻（容易弯），照片端重（整体荡开）
                for (let i = 1; i < n; i++) {
                    const pt = pts[i], isEnd = i === n - 1;
                    let ax = Math.sin(t * 1.3 + p.phase) * (isEnd ? 0.5 : 1.3);  // 微风
                    let ay = -26 * (isEnd ? 1.6 : 1);
                    let az = Math.cos(t * 1.1 + p.phase) * (isEnd ? 0.4 : 1.1);
                    const d = rayLocal.distanceToPoint(pt.pos);
                    if (d < PUSH_RADIUS) {
                        rayLocal.closestPointToPoint(pt.pos, tmpClosest);
                        tmpDir.subVectors(pt.pos, tmpClosest);
                        const len = tmpDir.length();
                        if (len > 1e-4) {
                            const strength = (1 - d / PUSH_RADIUS) * (isEnd ? 16 : 60);
                            ax += tmpDir.x / len * strength;
                            ay += tmpDir.y / len * strength;
                            az += tmpDir.z / len * strength;
                        }
                    }
                    const nx = pt.pos.x + (pt.pos.x - pt.prev.x) * 0.982 + ax * DT2;
                    const ny = pt.pos.y + (pt.pos.y - pt.prev.y) * 0.982 + ay * DT2;
                    const nz = pt.pos.z + (pt.pos.z - pt.prev.z) * 0.982 + az * DT2;
                    pt.prev.copy(pt.pos); pt.pos.set(nx, ny, nz);
                }

                // ② 约束求解：挂钩端钉死，绳长恒定；拖拽时照片端也钉在手上
                const invEnd = p.dragging ? 0 : 0.4;
                for (let iter = 0; iter < 4; iter++) {
                    pts[0].pos.copy(a);
                    for (let i = 0; i < n - 1; i++) {
                        const p1 = pts[i], p2 = pts[i + 1];
                        tmpDir.subVectors(p2.pos, p1.pos);
                        const len = tmpDir.length() || 1e-5;
                        const diff = (len - p.rope.segLen) / len;
                        const w1 = i === 0 ? 0 : 1;
                        const w2 = i === n - 2 ? invEnd : 1;
                        const total = (w1 + w2) || 1;
                        p1.pos.addScaledVector(tmpDir, diff * w1 / total);
                        p2.pos.addScaledVector(tmpDir, -diff * w2 / total);
                    }
                    if (p.dragging) {
                        pts[n - 1].pos.copy(p.dragTarget);
                        pts[n - 1].pos.y += p.size * 0.625;
                    }
                }
            }
        }

        function updatePhysics(time, dt) {
            if (!carouselDrag && !dragPhoto) {
                angularVelocity += (BASE_SPEED - angularVelocity) * (1 - Math.exp(-3 * dt));
            }
            if (!window.__car?.freeze) carouselGroup.rotation.y += angularVelocity * dt;

            // 小马起伏 + 檐口灯泡呼吸 + 扭蛋机动画
            for (const b of bobbers) b.mesh.position.y = b.baseY + Math.sin(time * 2 + b.phase) * 0.3;
            bulbMat.emissiveIntensity = 1.4 + Math.sin(time * 3) * 0.8;
            updateGachaAnim(time);

            // 软绳按固定步长推进（帧率无关）
            ropeAccum = Math.min(ropeAccum + dt, 4 * ROPE_DT);
            while (ropeAccum >= ROPE_DT) {
                stepRopes(ropeTime + ROPE_DT);
                ropeTime += ROPE_DT;
                ropeAccum -= ROPE_DT;
            }

            const k = Math.min(dt * 60, 2);   // 帧率无关的平滑系数
            for (const p of photos) {
                const pts = p.rope.pts, a = anchors[p.slot].anchor, end = pts[pts.length - 1].pos;

                // 照片挂在绳端 + 摆动倾斜 + 朝向平滑过渡
                if (!p.dragging) {
                    p.group.position.set(end.x, end.y - p.size * 0.625 + 0.05, end.z);
                }
                const offX = end.x - a.x, offZ = end.z - a.z;
                p.group.rotation.z = p.baseTilt + THREE.MathUtils.clamp(-offX * 0.05, -0.4, 0.4);
                p.group.rotation.x = THREE.MathUtils.clamp(offZ * 0.05, -0.4, 0.4);
                const dyRot = p.targetRotY - p.group.rotation.y;
                p.group.rotation.y += Math.atan2(Math.sin(dyRot), Math.cos(dyRot)) * Math.min(0.08 * k, 1);

                // 悬停放大 / 交换目标抖动提示
                p.hoverT += ((p.hovered || dropTarget === p ? 1 : 0) - p.hoverT) * Math.min(0.12 * k, 1);
                p.group.scale.setScalar(1 + p.hoverT * 0.15);
                if (dropTarget === p) p.group.rotation.z += Math.sin(time * 14) * 0.08;

                updateRopeLine(p);
            }

            // 粒子（速度按 dt 缩放，帧率无关）
            const arr = particleSystem.geometry.attributes.position.array;
            const frameScale = Math.min(dt * 60, 3);
            for (let i = 0; i < particleCount; i++) {
                arr[i * 3 + 1] += particleData[i].speedY * frameScale;
                arr[i * 3] += particleData[i].speedX * frameScale;
                const dx = arr[i * 3] - mousePoint.x, dy = arr[i * 3 + 1] - mousePoint.y, dz = arr[i * 3 + 2] - mousePoint.z;
                const d2 = dx * dx + dy * dy + dz * dz;
                if (d2 < 225) {
                    const d = Math.sqrt(d2) || 1, f = (15 - d) * 0.002 * frameScale;
                    arr[i * 3] += (dx / d) * f; arr[i * 3 + 1] += (dy / d) * f; arr[i * 3 + 2] += (dz / d) * f;
                }
                if (arr[i * 3 + 1] > 40) {
                    arr[i * 3 + 1] = -10;
                    arr[i * 3] = (Math.random() - 0.5) * 80;
                    arr[i * 3 + 2] = (Math.random() - 0.5) * 80;
                }
            }
            particleSystem.geometry.attributes.position.needsUpdate = true;
        }

        function animate() {
            requestAnimationFrame(animate);
            const dt = Math.min(clock.getDelta(), 0.1);   // 真实帧间隔，封顶防切页跳变
            updatePhysics(clock.getElapsedTime(), dt);
            renderer.render(scene, camera);
        }

        // 相机视图系统：全景（大门+全园）/ 旋转木马特写 / 扭蛋机特写
        let camMode = 'overview';
        let camTween = null;
        const camLook = new THREE.Vector3(0, 8, 0);
        function halfTan(aspect) { return Math.tan((45 / 2) * Math.PI / 180) * aspect; }
        function viewFor(name) {
            const ht = halfTan(window.innerWidth / window.innerHeight);
            if (name === 'overview') {
                const d = THREE.MathUtils.clamp(34 / ht, 85, 170);
                return { pos: new THREE.Vector3(0, 0.42 * d, 0.85 * d), look: new THREE.Vector3(0, 3, 6) };
            }
            if (name === 'gacha') {
                const d = THREE.MathUtils.clamp(11 / ht, 28, 85);
                return { pos: new THREE.Vector3(13, 5.4, 24 + d), look: new THREE.Vector3(13, 2.8, 24) };
            }
            const d = THREE.MathUtils.clamp(19 / ht, 40, 130);
            return { pos: new THREE.Vector3(0, 8 + 9 * (d / 47), d), look: new THREE.Vector3(0, 8, 0) };
        }
        function snapView() {
            const v = viewFor(camMode);
            camera.position.copy(v.pos);
            camLook.copy(v.look);
            camera.lookAt(camLook);
        }
        function flyTo(name, dur = 1.8) {
            const v = viewFor(name);
            camTween = {
                fromP: camera.position.clone(), toP: v.pos,
                fromL: camLook.clone(), toL: v.look,
                t0: clock.getElapsedTime(), dur
            };
            camMode = name;
            refreshUI();
        }
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            if (!camTween) snapView();
        });

        boot().then(animate).catch(err => {
            console.error(err);
            document.getElementById('loading-text').textContent = '启动失败：' + err.message;
            if (location.protocol === 'file:') {
                document.getElementById('file-hint').style.display = 'block';
            }
            window.__bootError = err.message;
        });

        // 供自动化测试/调试用：控制台里可以用 window.__car.handlePhotoFiles([...]) 模拟上传
        window.__car = { handlePhotoFiles, handleMusicFile, photos, group: carouselGroup, camera, anchors, state: () => ({ mode, albumId, isOwner, hasCloud: !!cloud }) };
        // 测试钩子：无 rAF 环境下手动推进物理（每步 = 1/60 秒）
        window.__car.step = (n = 1) => {
            for (let i = 0; i < n; i++) updatePhysics(ropeTime + ROPE_DT, ROPE_DT);
        };
        window.__car.dbg = () => {
            const p = photos.find(x => x.real);
            let rayDist = null;
            if (p) { p.group.getWorldPosition(tmpV); rayDist = +raycaster.ray.distanceToPoint(tmpV).toFixed(2); }
            return {
                pointer: { x: +pointer.x.toFixed(3), y: +pointer.y.toFixed(3) },
                mousePoint: mousePoint.toArray().map(v => +v.toFixed(1)),
                rayDist, frame: renderer.info.render.frame,
                carouselRotY: +carouselGroup.rotation.y.toFixed(3),
                downPhoto: downInfo ? !!downInfo.photo : null,
                carouselDragState: carouselDrag, dragPhotoState: !!dragPhoto,
                audio: { src: audio.src || null, playing: !audio.paused && !audio.ended, wantMusic, current: currentMusicUrl }
            };
        };
