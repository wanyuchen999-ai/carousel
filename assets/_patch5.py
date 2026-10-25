# -*- coding: utf-8 -*-
"""游乐园升级：四季大树 + 延伸圆台 + 季节切换 + 大气大门 v2"""
import re

src = open('app.js', encoding='utf-8').read()

# ========== 1. 大门 v2（更大更气派：7 层石柱 + 半圆拱 11 块 + 藤蔓爬升 + 大小花 + 大四叶草 + 童趣挂匾） ==========
m = re.search(r'(        /\* ==================== 游乐园大门（石拱 \+ 藤蔓小花 \+ 挂匾） ==================== \*/\n        function buildGate\(\) \{.*?\n        \}\n\n)(        /\* ==================== 扭蛋机 ==================== \*/\n        // 几何合并)', src, re.S)
assert m, 'gate section not found'

gate_v2 = '''        /* ==================== 游乐园大门（大气石拱 + 攀爬藤蔓 + 童趣挂牌） ==================== */
        function buildGate() {
            const gate = new THREE.Group();
            const stone = new THREE.MeshStandardMaterial({ color: PARK_C.stone, roughness: 0.88 });
            const stoneDark = new THREE.MeshStandardMaterial({ color: PARK_C.stoneDark, roughness: 0.9 });
            const goldMat = new THREE.MeshStandardMaterial({ color: PARK_C.gold, metalness: 0.6, roughness: 0.35 });
            const vineMat = new THREE.MeshStandardMaterial({ color: PARK_C.vine, roughness: 0.7 });
            const leafMat = new THREE.MeshStandardMaterial({ color: PARK_C.leaf, roughness: 0.75 });

            const stoneParts = [];
            const block = (x, y, z, w, h, d, j) => {
                const g = new THREE.BoxGeometry(w + j, h + j * 0.6, d + j);
                g.applyMatrix4(new THREE.Matrix4().setPosition(x, y, z));
                g.rotateY((Math.random() - 0.5) * 0.05);
                return g;
            };
            // 两侧大石柱：7 层错缝石块
            for (let i = 0; i < 7; i++) {
                const y = 0.55 + i * 1.06;
                const w = 2.1 + (i === 0 ? 0.3 : 0) + (i === 6 ? 0.35 : 0);
                stoneParts.push(block(-5.0, y, 0, w, 1.02, 2.0, 0.12));
                stoneParts.push(block(5.0, y, 0, w, 1.02, 2.0, 0.12));
            }
            // 柱顶石帽（外挑）
            stoneParts.push(block(-5.0, 7.95, 0, 2.7, 0.34, 2.5, 0.05));
            stoneParts.push(block(5.0, 7.95, 0, 2.7, 0.34, 2.5, 0.05));
            // 石拱：半圆弧 11 块楔形石（圆心 y7.9 半径 5.0）
            for (let i = 0; i <= 10; i++) {
                const a = Math.PI * (1 - i / 10);
                stoneParts.push(xformGeo(new THREE.BoxGeometry(2.2, 1.06, 2.0), Math.cos(a) * 5.0, 7.9 + Math.sin(a) * 5.0, 0, 0, 0, a + Math.PI / 2));
            }
            // 拱心石（外凸 + 金徽记 + 星）
            stoneParts.push(xformGeo(new THREE.BoxGeometry(1.3, 1.3, 2.2), 0, 13.1, 0));
            const arch = new THREE.Mesh(mergeGeoms(stoneParts), stone);
            gate.add(arch);
            const emblem = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.08, 8, 20), goldMat);
            emblem.position.set(0, 13.1, 1.0);
            gate.add(emblem);
            const star = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6),
                new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xd4af37, emissiveIntensity: 1.0 }));
            star.position.set(0, 13.1, 1.12);
            gate.add(star);

            // 石阶
            const step1 = new THREE.Mesh(new THREE.BoxGeometry(14.5, 0.3, 2.6), stoneDark);
            step1.position.set(0, 0.15, 0.4);
            const step2 = new THREE.Mesh(new THREE.BoxGeometry(13.0, 0.3, 1.8), stone);
            step2.position.set(0, 0.45, 0.3);
            gate.add(step1, step2);

            // ---- 攀爬藤蔓：绕柱三圈上升 → 越过拱顶 → 缠绕另一柱垂下 ----
            const vinePts = [];
            for (let i = 0; i <= 9; i++) {
                const ang = i * 1.05;
                vinePts.push(new THREE.Vector3(-5.0 + Math.cos(ang) * 1.12, 0.4 + i * 0.78, Math.sin(ang) * 1.12));
            }
            for (let s = 0; s <= 6; s++) {
                const a = Math.PI - (s / 6) * Math.PI;
                vinePts.push(new THREE.Vector3(Math.cos(a) * 4.7, 7.95 + Math.sin(a) * 4.7, 0.78));
            }
            for (let i = 9; i >= 0; i--) {
                const ang = i * 1.05 + 1.5;
                vinePts.push(new THREE.Vector3(5.0 + Math.cos(ang) * 1.12, 0.4 + i * 0.78, Math.sin(ang) * 1.12));
            }
            const vineCurve = new THREE.CatmullRomCurve3(vinePts);
            gate.add(new THREE.Mesh(new THREE.TubeGeometry(vineCurve, 140, 0.12, 6, false), vineMat));
            const vine2Pts = [];
            for (let i = 0; i <= 7; i++) {
                const ang = 1.2 + i * 1.15;
                vine2Pts.push(new THREE.Vector3(5.0 + Math.cos(ang) * 1.15, 0.35 + i * 0.95, Math.sin(ang) * 1.15));
            }
            gate.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vine2Pts), 60, 0.1, 6, false), vineMat));

            // ---- 藤上的叶子 ----
            const leafGeo = new THREE.SphereGeometry(0.16, 6, 5);
            const LEAVES = 40;
            const leaves = new THREE.InstancedMesh(leafGeo, leafMat, LEAVES);
            const lm4 = new THREE.Matrix4();
            for (let i = 0; i < LEAVES; i++) {
                const pt = vineCurve.getPoint(Math.random());
                lm4.setPosition(pt.x + (Math.random() - 0.5) * 0.55, pt.y + (Math.random() - 0.5) * 0.35, pt.z + (Math.random() - 0.5) * 0.55);
                leaves.setMatrixAt(i, lm4);
            }
            gate.add(leaves);

            // ---- 藤上的花：有大有小（一个字那么大的也有） ----
            const flowerGeo = new THREE.IcosahedronGeometry(1, 0);
            const flowerMat = new THREE.MeshStandardMaterial({ roughness: 0.45 });
            const FLOWERS = 26;
            const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, FLOWERS);
            const flowerCols = [0xf7d6e0, 0xfff2c9, 0xffffff, 0xf7d6e0, 0xffe9b0];
            const fm4 = new THREE.Matrix4();
            for (let i = 0; i < FLOWERS; i++) {
                const pt = vineCurve.getPoint(Math.random());
                const s = 0.16 + Math.random() * 0.34;
                fm4.compose(
                    new THREE.Vector3(pt.x + (Math.random() - 0.5) * 0.6, pt.y + (Math.random() - 0.5) * 0.4, pt.z + (Math.random() - 0.5) * 0.6),
                    new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, 0)),
                    new THREE.Vector3(s, s * 0.7, s)
                );
                flowers.setMatrixAt(i, fm4);
                flowers.setColorAt(i, new THREE.Color(flowerCols[i % flowerCols.length]));
            }
            gate.add(flowers);

            // ---- 门柱旁的大四叶草（×2） ----
            const cloverPetals = [];
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2;
                const p = new THREE.SphereGeometry(0.34, 10, 8);
                p.scale(1, 1.35, 0.55);
                cloverPetals.push(xformGeo(p, Math.cos(a) * 0.3, 0.34 + Math.sin(a) * 0.3, 0));
            }
            cloverPetals.push(xformGeo(new THREE.CylinderGeometry(0.05, 0.07, 1.5, 6), 0, -0.4, 0));
            const cloverGeo = mergeGeoms(cloverPetals);
            const cloverMat = new THREE.MeshStandardMaterial({ color: 0x7fae6d, roughness: 0.65 });
            for (const px of [-7.4, 7.4]) {
                const clover = new THREE.Mesh(cloverGeo, cloverMat);
                clover.position.set(px, 0.95, 1.2);
                clover.rotation.y = Math.random() * Math.PI;
                clover.scale.setScalar(1.25);
                gate.add(clover);
            }

            // ---- 挂匾：童趣手绘（白云 + 小花 + 大四叶草 + 手写字） ----
            const bsc = document.createElement('canvas'); bsc.width = 1200; bsc.height = 360;
            const drawBoard = () => {
                const bx = bsc.getContext('2d');
                bx.beginPath();
                bx.moveTo(60, 0); bx.lineTo(1140, 0); bx.quadraticCurveTo(1200, 0, 1200, 60);
                bx.lineTo(1200, 300); bx.quadraticCurveTo(1200, 360, 1140, 360);
                bx.lineTo(60, 360); bx.quadraticCurveTo(0, 360, 0, 300);
                bx.lineTo(0, 60); bx.quadraticCurveTo(0, 0, 60, 0);
                bx.closePath();
                const g = bx.createLinearGradient(0, 0, 0, 360);
                g.addColorStop(0, '#fdf8ec'); g.addColorStop(1, '#f0e6cf');
                bx.fillStyle = g; bx.fill();
                bx.strokeStyle = '#c9a86a'; bx.lineWidth = 10; bx.stroke();
                bx.strokeStyle = '#a8b894'; bx.lineWidth = 5; bx.setLineDash([1, 18]); bx.lineCap = 'round';
                bx.beginPath(); bx.moveTo(56, 34); bx.lineTo(1144, 34); bx.stroke();
                bx.beginPath(); bx.moveTo(56, 326); bx.lineTo(1144, 326); bx.stroke();
                bx.setLineDash([]);
                const clover = (cx2, cy2, s, rot) => {
                    bx.save(); bx.translate(cx2, cy2); bx.rotate(rot);
                    bx.fillStyle = '#7fae6d';
                    for (let i = 0; i < 4; i++) {
                        const a = (i / 4) * Math.PI * 2;
                        bx.beginPath();
                        bx.ellipse(Math.cos(a) * 30 * s, Math.sin(a) * 30 * s, 26 * s, 20 * s, a, 0, Math.PI * 2);
                        bx.fill();
                    }
                    bx.fillStyle = '#5d8a4e';
                    bx.beginPath(); bx.arc(0, 0, 12 * s, 0, Math.PI * 2); bx.fill();
                    bx.restore();
                };
                clover(120, 180, 1.5, 0.3);
                clover(1080, 180, 1.2, -0.5);
                const cloud = (cx2, cy2, s) => {
                    bx.fillStyle = 'rgba(255,255,255,0.95)';
                    bx.beginPath();
                    bx.arc(cx2, cy2, 26 * s, 0, Math.PI * 2);
                    bx.arc(cx2 + 30 * s, cy2 - 12 * s, 20 * s, 0, Math.PI * 2);
                    bx.arc(cx2 - 30 * s, cy2 - 6 * s, 18 * s, 0, Math.PI * 2);
                    bx.arc(cx2 + 8 * s, cy2 - 22 * s, 16 * s, 0, Math.PI * 2);
                    bx.fill();
                };
                cloud(950, 92, 1);
                const flower2 = (cx2, cy2, s, col) => {
                    bx.fillStyle = col;
                    for (let i = 0; i < 5; i++) {
                        const a = (i / 5) * Math.PI * 2;
                        bx.beginPath(); bx.arc(cx2 + Math.cos(a) * 16 * s, cy2 + Math.sin(a) * 16 * s, 10 * s, 0, Math.PI * 2); bx.fill();
                    }
                    bx.fillStyle = '#ffd93d';
                    bx.beginPath(); bx.arc(cx2, cy2, 8 * s, 0, Math.PI * 2); bx.fill();
                };
                flower2(150, 80, 1.1, '#f7d6e0');
                flower2(1050, 260, 0.9, '#fff2c9');
                flower2(360, 62, 0.8, '#f7d6e0');
                flower2(840, 300, 0.85, '#fff2c9');
                bx.fillStyle = '#5a4a2e';
                bx.shadowColor = 'rgba(120,100,50,0.3)'; bx.shadowBlur = 8; bx.shadowOffsetY = 4;
                bx.font = '170px "Ma Shan Zheng", "KaiTi", cursive';
                bx.textAlign = 'center'; bx.textBaseline = 'middle';
                bx.fillText('以你为名的乐园', 600, 192);
                bx.shadowBlur = 0; bx.shadowOffsetY = 0;
            };
            drawBoard();
            fontReady.then(() => { drawBoard(); boardTex.needsUpdate = true; });
            const boardTex = new THREE.CanvasTexture(bsc);
            const board = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 3.1),
                new THREE.MeshBasicMaterial({ map: boardTex, side: THREE.DoubleSide, toneMapped: false }));
            board.position.set(0, 10.1, 0.9);
            gate.add(board);
            const chainGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6);
            for (const px of [-3.4, 3.4]) {
                const chain = new THREE.Mesh(chainGeo, goldMat);
                chain.position.set(px * 0.72, 11.6, 0.7);
                chain.rotation.z = px > 0 ? -0.35 : 0.35;
                gate.add(chain);
            }

            // ---- 门柱顶灌木球 ----
            const bushMat = new THREE.MeshStandardMaterial({ color: 0x8fae7e, roughness: 0.8 });
            for (const px of [-5.0, 5.0]) {
                const bush = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), bushMat);
                bush.position.set(px, 8.5, 0);
                bush.scale.y = 0.85;
                gate.add(bush);
            }

            gate.position.set(0, 0, 30);
            scene.add(gate);
        }

'''
src = src[:m.start(1)] + gate_v2 + m.group(2) + src[m.end(2):]

# ========== 2. 四季大树 + 延伸圆台 + 树荫（插在 buildReservedPad 之后） ==========
anchor2 = '''            pad.position.set(x, 0.02, z);
            scene.add(pad);
        }'''
tree_fn = anchor2 + '''

        /* ==================== 四季大树（延伸圆台上，遮住半个木马） ==================== */
        const TREE_SEASONS = {
            spring: [0xffb7c9, 0xffd6e2, 0xf7a8c4, 0xfff0f5],
            summer: [0x2d6a4f, 0x40916c, 0x52b788, 0x1b4332],
            autumn: [0xe8590c, 0xf48c06, 0xd9480f, 0xffa94d],
            winter: [0xf0f4f8, 0xe2e8f0, 0xd7e3f4, 0xcdd9ea]
        };
        let treeFoliage = null, shadeBlob = null;
        function buildTreePad() {
            // 延伸圆台：与木马平台相接
            const pad = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.8, 0.14, 32),
                new THREE.MeshStandardMaterial({ color: 0xf0e6d2, roughness: 0.8 }));
            pad.position.set(-15, 0.07, 7);
            scene.add(pad);
            // 树荫（落在木马平台 + 草地上的柔和阴影）
            shadeBlob = new THREE.Mesh(new THREE.CircleGeometry(11, 32),
                new THREE.MeshBasicMaterial({ color: 0x0a1a10, transparent: true, opacity: 0.16, depthWrite: false }));
            shadeBlob.rotation.x = -Math.PI / 2;
            shadeBlob.position.set(-12.5, 2.8, 4);
            scene.add(shadeBlob);
        }
        function buildBigTree() {
            const tree = new THREE.Group();
            tree.position.set(-15, 0.14, 7);
            const barkMat = new THREE.MeshStandardMaterial({ color: 0x6b4f33, roughness: 0.85 });
            // 树干（上细下粗）
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 1.15, 9.5, 10), barkMat);
            trunk.position.y = 4.75;
            tree.add(trunk);
            // 大枝 ×4（伸向木马方向为主）
            const branches = new THREE.Mesh(mergeGeoms([
                xformGeo(new THREE.CylinderGeometry(0.2, 0.34, 5.2, 8), 2.4, 10.2, 1.6, 0, 0, -0.85),
                xformGeo(new THREE.CylinderGeometry(0.18, 0.3, 4.6, 8), -1.2, 10.6, 2.0, 0.35, 0, 0.4),
                xformGeo(new THREE.CylinderGeometry(0.18, 0.3, 4.4, 8), -2.6, 10.8, -1.6, -0.5, 0, -0.5),
                xformGeo(new THREE.CylinderGeometry(0.16, 0.28, 4.0, 8), 0.4, 11.2, -2.4, -0.9, 0, 0.6)
            ]), barkMat);
            tree.add(branches);
            // 树冠：大量叶团（InstancedMesh，随季节变色）
            treeFoliage = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6),
                new THREE.MeshStandardMaterial({ roughness: 0.75 }), 220);
            const m4 = new THREE.Matrix4();
            // 树冠中心偏向木马（覆盖其一半），椭球分布
            const cx = 2.6, cy = 15.2, cz = -2.2;
            for (let i = 0; i < 220; i++) {
                const a = Math.random() * Math.PI * 2;
                const rr = Math.pow(Math.random(), 0.6);
                const px = Math.cos(a) * rr * 9.6;
                const pz = Math.sin(a) * rr * 9.6;
                const py = (Math.random() - 0.42) * 8.6 * (1 - rr * 0.35);
                m4.compose(
                    new THREE.Vector3(cx + px, cy + py, cz + pz),
                    new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3)),
                    new THREE.Vector3(1.5 + Math.random() * 1.4, 1.3 + Math.random() * 1.2, 1.5 + Math.random() * 1.4)
                );
                treeFoliage.setMatrixAt(i, m4);
            }
            tree.add(treeFoliage);
            scene.add(tree);
        }
        function setTreeSeason(s) {
            const cols = TREE_SEASONS[s];
            for (let i = 0; i < treeFoliage.count; i++) {
                treeFoliage.setColorAt(i, new THREE.Color(cols[(i * 7 + Math.floor(i / 3)) % cols.length]));
            }
            treeFoliage.instanceColor.needsUpdate = true;
            if (shadeBlob) shadeBlob.material.opacity = s === 'winter' ? 0.08 : 0.16;
            if (typeof particles !== 'undefined') {
                particles.material.color.set(s === 'spring' ? 0xffb7c9 : s === 'autumn' ? 0xe8590c : s === 'winter' ? 0xdfe8f4 : 0xffd0f0);
            }
        }'''
assert anchor2 in src, 'reserved pad fail'
src = src.replace(anchor2, tree_fn, 1)

# ========== 3. boot 装配 ==========
old3 = '''            buildGachaMachine();       // 设施一：扭蛋机摊位
            buildReservedPad(-20, -14);   // 预留空位（未来项目）
            buildReservedPad(18, -20);    // 预留空位（未来项目）'''
new3 = '''            buildGachaMachine();       // 设施一：扭蛋机摊位
            buildTreePad();            // 设施二：大树延伸圆台（与木马相连）
            buildBigTree();            // 设施二：四季大树
            buildReservedPad(-20, -14);   // 预留空位（未来项目）
            buildReservedPad(18, -20);    // 预留空位（未来项目）'''
assert old3 in src, 'boot fail'
src = src.replace(old3, new3, 1)

open('app.js', 'w', encoding='utf-8').write(src)
print('patch part A done')
