# -*- coding: utf-8 -*-
"""重写 makeNoteCanvas 为做旧牛皮纸风格"""
import re

src = open('app.js', encoding='utf-8').read()

m = re.search(r'(        // 日记纸渲染（640×840）：纸底 \+ 横线 \+ 和纸胶带 \+ 日期昵称 \+ 内容（手写字/照片印纹）\n        function makeNoteCanvas\(note\) \{.*?\n        \}\n\n        function showEggModal)', src, re.S)
assert m, 'makeNoteCanvas not found'

new_fn = '''        // 牛皮纸纸条（做旧风）：撕边牛皮纸 + 手写体 + 胶带 + 日期
        function makeNoteCanvas(note) {
            return new Promise(async (resolve) => {
                try { await fontReady; } catch (e) { /* 忽略 */ }
                const W = 720, H = 920;
                const c = document.createElement('canvas'); c.width = W; c.height = H;
                const ctx = c.getContext('2d');

                // ---- 做旧牛皮纸底（撕边） ----
                const px = 26, py = 26, pw = W - 52, ph = H - 52;
                const jag = (n) => Array.from({ length: n + 1 }, () => (Math.random() - 0.5) * 7);
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
                ctx.beginPath();
                const tx = jag(16), bx = jag(16), ly = jag(20), ry = jag(20);
                ctx.moveTo(px + tx[0], py);
                for (let i = 0; i < 16; i++) ctx.lineTo(px + (pw / 16) * i + tx[i], py + (i % 2 ? -3 : 3));
                ctx.lineTo(px + pw + bx[16], py);
                for (let i = 0; i < 20; i++) ctx.lineTo(px + pw + (i % 2 ? 4 : -4) + bx[i], py + (ph / 20) * i);
                ctx.lineTo(px + pw + bx[16], py + ph);
                for (let i = 16; i >= 0; i--) ctx.lineTo(px + (pw / 16) * i + bx[i], py + ph + (i % 2 ? 3 : -3));
                ctx.lineTo(px + tx[0], py + ph);
                for (let i = 20; i >= 0; i--) ctx.lineTo(px + (i % 2 ? 4 : -4) + ly[i], py + (ph / 20) * i);
                ctx.closePath();
                const kg = ctx.createLinearGradient(0, 0, W, H);
                kg.addColorStop(0, '#c9a26a'); kg.addColorStop(0.5, '#bb9257'); kg.addColorStop(1, '#a8834e');
                ctx.fillStyle = kg;
                ctx.fill();
                ctx.restore();

                // ---- 牛皮纸纹理：噪点 + 纤维 + 污渍 + 折痕 ----
                ctx.save();
                ctx.beginPath();
                ctx.rect(px + 4, py + 4, pw - 8, ph - 8);
                ctx.clip();
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

                // ---- 和纸胶带 ×2（左上/右上，斜贴） ----
                const tape = (tx, ty, rot, color) => {
                    ctx.save();
                    ctx.translate(tx, ty); ctx.rotate(rot);
                    ctx.fillStyle = color;
                    ctx.fillRect(-85, -22, 170, 44);
                    ctx.fillStyle = 'rgba(255,255,255,0.28)';
                    ctx.fillRect(-85, -8, 170, 5);
                    ctx.restore();
                };
                tape(px + 88, py + 14, -0.16, 'rgba(214,120,110,0.72)');
                tape(px + pw - 88, py + 14, 0.14, 'rgba(160,190,220,0.6)');

                // ---- 日期（左上） + 昵称（右下） ----
                const d = new Date();
                ctx.fillStyle = '#4a3421';
                ctx.font = '34px "Ma Shan Zheng", "KaiTi", cursive';
                ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
                ctx.fillText(d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日', px + 56, py + 92);
                ctx.textAlign = 'right';
                ctx.font = '30px "Ma Shan Zheng", "KaiTi", cursive';
                ctx.fillStyle = 'rgba(74,52,33,0.8)';
                ctx.fillText(note.nickname || '', px + pw - 56, py + ph - 46);

                // ---- 内容 ----
                const ink = '#43301a';
                ctx.fillStyle = ink;
                ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
                const lineH = 84, tx0 = px + 60, ty0 = py + 210;

                if (note.kind === 'image' && note.url) {
                    // 照片：白色相框贴纸（微旋转）+ 胶带角
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        ctx.save();
                        ctx.translate(px + pw / 2, py + 400);
                        ctx.rotate(-0.035);
                        ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
                        ctx.fillStyle = '#f8f4ea';
                        const fw = 440, fh = 400;
                        ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
                        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
                        const s = Math.min(img.width / (fw - 36), img.height / (fh - 64));
                        const sw2 = (fw - 36) * s, sh2 = (fh - 64) * s;
                        ctx.drawImage(img, (img.width - sw2) / 2, (img.height - sh2) / 2, sw2, sh2, -fw / 2 + 18, -fh / 2 + 18, fw - 36, fh - 64);
                        ctx.restore();
                        // 照片下方的手写备注行
                        ctx.fillStyle = ink;
                        ctx.font = '40px "Ma Shan Zheng", "KaiTi", cursive';
                        ctx.textAlign = 'center';
                        ctx.fillText('（这张照片，也留在扭蛋里）', px + pw / 2, py + ph - 120);
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
                        if (ch === '\\n') { ctx.fillText(line, x, y); y += lineH; line = ''; continue; }
                        if (ctx.measureText(line + ch).width > pw - 120) {
                            ctx.fillText(line, x, y); y += lineH; line = ch;
                        } else line += ch;
                    }
                    if (line) ctx.fillText(line, x, y);
                    resolve(c);
                }
            });
        }

        function showEggModal'''

src = src[:m.start(1)] + new_fn + src[m.end(1):]
open('app.js', 'w', encoding='utf-8').write(src)
print('D done')
