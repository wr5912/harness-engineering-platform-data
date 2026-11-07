/**
 * 更名迁移助手：把 profile 里的旧包名换成 dsh-decision-engine。
 *
 * 为什么需要这一步：本项目从 `dsh-startlux-decision` 更名为 `dsh-decision-engine`。
 * profile 的 `package.json` 里有两处按名字引用插件——
 *
 *   dsh.profile.bundles[]   决定「加载哪些 bundle」
 *   dependencies{}          决定「从哪里装」
 *
 * 只改其中一处，DSH 就找不到插件（表现为插件从列表里消失，或启动报
 * 无法解析模块）。包名与依赖 key 必须同时改，且 key 必须与新包名一致。
 *
 * 用法：
 *   node scripts/migrate-profile.mjs           # 预览要改什么（默认，不写文件）
 *   node scripts/migrate-profile.mjs --write   # 真正写入（会先备份）
 *
 * 只处理 `dsh.profile.bundles` 与 `dependencies`/`devDependencies` 里的
 * `dsh-startlux-decision`，其它字段一概不动。
 */

import { copyFile, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const OLD_NAME = "dsh-startlux-decision";
const NEW_NAME = "dsh-decision-engine";
const WRITE = process.argv.includes("--write");

/** 候选 profile 路径：优先 desktop，其次是配置里能找到的其它 profile。 */
function candidateProfiles() {
  const base = join(homedir(), ".dsh", "profiles");
  return ["desktop", "web", "cli"].map((name) => join(base, name, "package.json"));
}

/** 找到第一个存在的 profile package.json。 */
async function pickProfile() {
  for (const path of candidateProfiles()) {
    if (existsSync(path)) return path;
  }
  return undefined;
}

/**
 * 计算改动。刻意不解析成 AST：profile 的 package.json 结构固定，
 * 按文本替换既能保留原有格式与缩进，也不会把注释（JSONC）弄丢。
 *
 * @param text - package.json 原文。
 * @returns `{ next, notes }`；notes 说明改了哪些位置。
 */
export function migrateProfileJson(text) {
  const notes = [];
  let next = text;

  // 1) bundles 数组里的一项
  const bundleLine = new RegExp(`^(\\s*)"${OLD_NAME}"(,?)$`, "m");
  if (bundleLine.test(next)) {
    next = next.replace(bundleLine, `$1"${NEW_NAME}"$2`);
    notes.push(`dsh.profile.bundles: "${OLD_NAME}" → "${NEW_NAME}"`);
  }

  // 2) 依赖键（值不变：仍指向同一份本地目录或同一版本）
  const depLine = new RegExp(`^(\\s*)"${OLD_NAME}"(\\s*:\\s*)"([^"]*)"(,?)$`, "m");
  if (depLine.test(next)) {
    next = next.replace(depLine, `$1"${NEW_NAME}"$2"$3"$4`);
    notes.push(`dependencies: "${OLD_NAME}" → "${NEW_NAME}"`);
  }

  if (notes.length === 0) {
    notes.push(`没有找到 "${OLD_NAME}"，profile 可能已经迁移过`);
  }
  return { next, notes };
}

const profilePath = await pickProfile();
if (profilePath === undefined) {
  console.error(`未找到 profile 的 package.json（找过：${candidateProfiles().join(", ")}）`);
  process.exit(2);
}

const before = await readFile(profilePath, "utf8");
const { next, notes } = migrateProfileJson(before);

console.log(`profile: ${profilePath}`);
for (const note of notes) console.log(`  - ${note}`);

if (next === before) {
  console.log("\n无需改动。");
  process.exit(0);
}

if (!WRITE) {
  console.log("\n以上为预览。确认无误后加 --write 真正写入（会先备份 .bak）。");
  process.exit(0);
}

const backup = `${profilePath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
await copyFile(profilePath, backup);
await writeFile(profilePath, next, "utf8");
console.log(`\n已写入。原文件备份在：${backup}`);
console.log("接着执行：cd " + join(profilePath, "..") + " && pnpm install");
console.log("然后重启 DSH。配置（config.yml，旧名 startlux.yml 会被自动迁移）不需要重填。");