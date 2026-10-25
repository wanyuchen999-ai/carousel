# -*- coding: utf-8 -*-
"""Kenney 自然模型接入公园（单次写入，避免部分应用）"""
src = open('app.js', encoding='utf-8').read()

# 1) 程序化树 → Kenney 占位注释
old_trees = '''            const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a7358, roughness: 0.7 });
            const crownMat = new THREE.MeshStandardMaterial({ color: 0x74936a, roughness: 0.8 });
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
            park.add(trunks, crowns1, crowns2);'''
new_trees = '''            // Kenney 低模树/灌木/石头在此异步加载（见 loadKenneyNature）'''
assert old_trees in src, 'trees fail'
src = src.replace(old_trees, new_trees, 1)

# 2) park 尾部后加 Kenney 异步加载函数
old_tail = '''            scene.add(park);
        }'''
new_tail = '''            scene.add(park);
        }

        // Kenney 自然素材（CC0 低模树/灌木/石头）异步加载
        async function loadKenneyNature() {
            try {
                const loader = new GLTFLoader();
                const kenneyGroup = new THREE.Group();
                // 大树：tree_detailed 站在树荫圆台（替换程序化大树）
                const gltfBig = await loader.loadAsync('assets/kenney/tree_detailed.glb');
                const big = gltfBig.scene;
                const bb = new THREE.Box3().setFromObject(big);
                const bs = bb.getSize(new THREE.Vector3());
                const bigScale = 21 / Math.max(bs.y, 0.001);
                big.scale.setScalar(bigScale);
                bb.setFromObject(big);
                const bc = bb.getCenter(new THREE.Vector3());
                big.position.set(-15 - bc.x * bigScale, 0.1 - bb.min.y * bigScale, 7 - bc.z * bigScale);
                kenneyGroup.add(big);
                treeLeafMats.length = 0;
                big.traverse(o => { if (o.isMesh && o.material) treeLeafMats.push(o.material); });
                // 散布的树/灌木/石头（避开门和两个圆台）
                const spots = [
                    { f: 'tree_oak.glb', p: [22, 0, -14], s: 3.2 },
                    { f: 'tree_fat.glb', p: [-22, 0, -18], s: 3.4 },
                    { f: 'tree_pineTallA_detailed.glb', p: [24, 0, 8], s: 3.0 },
                    { f: 'tree_pineRoundA.glb', p: [-25, 0, 4], s: 3.2 },
                    { f: 'plant_bushDetailed.glb', p: [-17, 0, 20], s: 2.6 },
                    { f: 'plant_bushLarge.glb', p: [20, 0, 18], s: 2.8 },
                    { f: 'plant_bushSmall.glb', p: [24, 0, -4], s: 2.4 },
                    { f: 'rock_largeA.glb', p: [-8, 0, 26], s: 2.2 },
                    { f: 'rock_largeB.glb', p: [10, 0, -26], s: 2.0 }
                ];
                for (const sp of spots) {
                    const g2 = await loader.loadAsync('assets/kenney/' + sp.f);
                    const m2 = g2.scene;
                    const bb2 = new THREE.Box3().setFromObject(m2);
                    const bs2 = bb2.getSize(new THREE.Vector3());
                    const sc2 = sp.s / Math.max(bs2.y, 0.001);
                    m2.scale.setScalar(sc2);
                    bb2.setFromObject(m2);
                    const c2 = bb2.getCenter(new THREE.Vector3());
                    m2.position.set(sp.p[0] - c2.x * sc2, 0.05 - bb2.min.y * sc2, sp.p[1] - c2.z * sc2);
                    m2.rotation.y = Math.random() * Math.PI * 2;
                    kenneyGroup.add(m2);
                }
                scene.add(kenneyGroup);
                return true;
            } catch (e) {
                console.warn('Kenney 素材加载失败（用程序化树兜底）', e);
                return false;
            }
        }'''
count = src.count(old_tail)
assert count == 1, f'park tail x{count}'
src = src.replace(old_tail, new_tail, 1)

# 3) boot：程序化兜底 + Kenney 加载（成功则替换程序化大树）
old_boot = '''            buildTreePad();            // 设施二：大树延伸圆台（与木马相连）
            buildBigTree();            // 设施二：四季大树'''
new_boot = '''            buildTreePad();            // 设施二：大树延伸圆台（与木马相连）
            buildBigTree();            // 程序化兜底大树
            loadKenneyNature().then(ok => {
                if (ok && bigTreeGroup) { scene.remove(bigTreeGroup); bigTreeGroup = null; }
                setTreeSeason(treeSeason);   // 应用季节染色（含 Kenney 树）
            });'''
assert old_boot in src, 'boot fail'
src = src.replace(old_boot, new_boot, 1)

# 4) setTreeSeason：Kenney 材质季节染色
old_t = '''            for (let i = 0; i < treeLeafMats.length; i++) {
                treeLeafMats[i].color.set(cols[i % cols.length]);
            }'''
new_t = old_t + '''
            const tints = { spring: 0xffd6e2, summer: 0xffffff, autumn: 0xe8a04d, winter: 0xcdd9ea };
            for (const m of treeLeafMats) m.color.set(tints[s]);'''
assert old_t in src, 'tint fail'
src = src.replace(old_t, new_t, 1)

open('app.js', 'w', encoding='utf-8').write(src)
print('kenney integrated (single write)')
