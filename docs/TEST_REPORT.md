# 真实全流程测试报告

2026-11-24，Asia/Shanghai。分支 `codex/experience-evolution`。GameForge 原始提交 `04a3a7c6`；RGC 来源 `8284caeac655e8c6c08354a759b97b1599d426fd`。

本报告区分真实供应商/浏览器执行、确定性回归测试和未开展的人类实验。原始游戏、图片、录像、轨迹与 usage 保存在本机，不包含在源代码中。

## 真实产物

- 3 款横版游戏与 1 款文字冒险使用真实 DeepSeek / Qwen 文本和 Qwen 图片 API 生成。
- 月球候选经过原版、候选各 3 局实际按键试玩及 A/B、B/A 盲评，两次均偏好候选。检查了 5 处精确文本修改，涉及 HUD、失败浮层、起跳线及重试说明，没有修改物理、平台、生命或胜负逻辑。
- 选用该候选后，明确清理了 11 个不存在的可选 sprite 预加载，继续使用现有 Canvas 图形，保存为新版本。最终源代码另行完成真实容器 3 局试玩验证。导出阶段没有替换代码。
- 其他候选因验证失败、评审分歧或无效证据引用而未采用，旧版保留。执行完策略不等于获胜或好玩。
- 所有 4 款游戏的预览与 ZIP 入口字节一致、冻结资产哈希一致；解压后在断网浏览器实际操作通过，最终版本没有失败的资源请求。
- 文字冒险完成 14 场景、14 张场景插画及封面，实际点击走通成功/失败结局，并验证重新开始。

| 游戏 | Game ID | 最终验证版本 | 冻结素材数 | 离线/输入/字节验证 |
|---|---|---|---:|---|
| 月球快递 | `45ebaabcc1414eaa` | `bb388f0d926ac318a0d4e626499874d3` | 0 | 通过 |
| 萤火归途 | `eb5d7c29504f4853` | `ba373f6b7d0d565dc37517ed2ca67156` | 1 | 通过 |
| 冰原救援 | `fc1097561f384e01` | `d97f80db2bf0f0492167d08ad43938e5` | 0 | 通过 |
| 灯塔谜案 | `ea1fd3c6e0694acf` | `81cf94236a99bb67f823e17fb8a6ee76` | 15 | 通过 |

入口 SHA-256：

- `45ebaabcc1414eaa`：`c7d839206397fa335975c94329ba9e798350efeaf215c41944bf4bd1da17bc60`
- `eb5d7c29504f4853`：`add1247536967564bd727346d50856d0e67fd0385687b001e626ca365200dbad`
- `fc1097561f384e01`：`57f3abb82a1ab8362172e3012c6d7e1231c711ea42d6e6bdf21678fc8d6edcdf`
- `ea1fd3c6e0694acf`：`bb1e6d672b86c71d52c1c06b6199c2f35165ff4df2608ad505bd72eefc606fd9`

## 真实控制和异常验收

| 检查 | 观察结果 |
|---|---|
| 原版先测与双顺序盲评 | `live-lunar-02` 原版/候选各 3 局；A/B 胜者 B，B/A 胜者 A，引用指向存在的证据路径，结果 improved_proxy。 |
| 保留旧版 | `live-ice-01` 因评审分歧/引用不满足校验而保留 baseline。 |
| 停止恢复 | 实际停止 `live-lunar-02` 后恢复完成；baseline-player 仅派发 1 次，复用已完成策略，中断尝试归档。 |
| 硬调用预算 | `live-budget-01` 恰好完成 4 次派发，第 5 次之前停止，交付已验证 baseline，原因 Model-call budget exhausted。 |
| 并发编辑冲突 | 任务期间保存手动修改，以旧 expectedVersion 选版得到 HTTP 409，手动修改仍保留；随后通过浏览器明确选用候选。 |
| 证据篡改 | 临时改变实际 PNG 字节，证据接口 409、结果接口 400；恢复原字节后校验通过。 |
| 版本完整性 | 回归测试覆盖 HTML、文本入口、素材篡改及重复快照校验；完整回退会清除目标版本不存在的字段。 |
| 真实隔离夹具 | 实际 DockerGame 中外网请求失败，无 Node process、API key/token 环境或 Docker socket；网络 none，源和 rootfs 只读，非 root 1000:1000，cap-drop ALL、no-new-privileges，内存 1 GiB、2 CPU、256 进程。此负向夹具不计为模型游戏。 |
| Origin 与认证 | 合法 127.0.0.1 Origin 写入通过；Origin:null 写入 403。生产进程无认证 401，HTTP Basic 认证 200，页面 200，导出入口哈希与开发环境一致。 |
| 凭据 | 扫描 Git 管理与未忽略的新文件，没有用户提供的凭据；.env.local、游戏数据与证据均被 Git 忽略。 |

## 自动检查

- Node 项目测试：11 通过。
- 独立控制器 Python 测试：5 通过，覆盖预算、保留规则、证据、模型等待中停止/防重复派发及精确编辑唯一匹配。
- 使用本项目 vendored RGC 包执行来源项目 runtime/player-input/recording 子集：55 通过，3 跳过。初次并行构建期间一个 150 ms 传输测试发生时序超时；独立重跑整个子集通过，未修改该测试。
- TypeScript、ESLint（无警告）、Next.js 优化构建、生产启动、冻结锁文件安装、Git diff 空白检查均通过。
- 构建存在 Browserslist 缓存较旧提示，不影响构建成功。

## 执行中发现并修复

1. 模型 HTML 语法错误：保存前仅编译检查 JavaScript，不在宿主执行；有上限的模型修复已真实成功。
2. 整页输出截断/JSON 后附文字：候选改用少量唯一匹配文本编辑，结构化调用使用 JSON mode；旧失败任务保留，已完成或响应不明的调用不自动重复派发。
3. 初始运行时不可用：明确失败，无宿主执行降级；安装隔离运行时后恢复。
4. 首帧截屏失败：等待真实绘制，仅对无输入副作用的截屏有限重试。输入从不因丢失响应而重放。
5. 恢复时工作目录存在：归档中断/失效尝试，重新创建运行目录，真实恢复复测通过。
6. 回退残留字段、锁竞争与列表消失、Worker 启动失败卡 queued、旧进程退出覆盖新状态、Origin 误判、改变配置仍复用旧游戏等问题均修复。
7. 修改上游设计复用旧图片/HTML：使下游引用失效并保留旧版本；相同配置失败才续跑，需求/语言/模型/素材策略变化新建游戏。
8. 图片服务超时及一次 HTTP 400：保留已完成的图片，从检查点继续；最终完成全部图片与封面，没有重生成已完成图片。
9. 文本模板升级影响旧版导出：文本版本现在冻结并校验渲染后的 HTML 入口。

## 证据与复现

仓库根目录下：

- output/live-e2e/report.json：4 款产物的哈希、正常输入和文本点击路径；每款目录有 ZIP、离线文件、截图。
- output/acceptance-runs.json：实际成功/失败任务概览。
- output/sandbox-check.json、output/production-check.json：隔离与生产验证。
- .gameforge-data/<gameId>/runs/<runId>/：input、state、budget、模型结果与 evidence 清单。重点查看 live-lunar-02、live-final-validation、live-budget-01。
- output/playwright/improvement-panel.png：实际界面截图。
- .tools/stop-resume.json、.tools/manual-conflict.json、.tools/tamper-test.json、.tools/text-resume.ndjson：异常与恢复结果。

启动本地应用后运行：

```sh
node scripts/live-e2e.mjs 45ebaabcc1414eaa eb5d7c29504f4853 fc1097561f384e01 ea1fd3c6e0694acf
```

本机 Chrome 设置 GAMEFORGE_TEST_BROWSER=chrome。该脚本不派发付费生成。

## 范围与限制

- **未开展真人好玩度实验**。没有真人偏好胜率、留存率、D1/D7 或长期玩乐数据；模型评价与有限轨迹不能证明普遍好玩。
- 自动改进当前面向 HTML/Canvas 横版游戏；文字冒险验证了原有生成、分支、插画、离线与重试，未实现叙事自动改进。没有声称复现所有论文实验或全部上游功能。
- 面向单所有者本地/自托管工具。多租户账户、生产级多租户权限、Vercel 临时磁盘下的分布式部署、Godot 与移动端真人触屏体验不在已验证范围。
- 已派发远程请求不能保证撤回收费；响应不明时不自动重复派发。费用缺少可信单价，保留 unknown/null。
- 非必要的临时镜像下载缓存清理被自动审批拒绝（blocked by policy）；缓存留在 .tools/runtime-image，已安装的运行时不受影响。
