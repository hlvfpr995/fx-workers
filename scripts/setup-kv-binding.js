const fs = require('node:fs');
const path = require('node:path');
const {execSync} = require('node:child_process');

const ROOT = process.cwd();
const WRANGLER_TOML = path.join(ROOT, 'wrangler.toml');
const BINDING = process.argv[2] || 'CONFIG_KV';

const run = (cmd) => {
    console.log(`\n> ${cmd}`);
    return execSync(cmd, {encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe']});
};

const extractNamespaceId = (rawOutput) => {
    const text = (rawOutput || '').trim();

    try {
        const parsed = JSON.parse(text);
        const candidates = Array.isArray(parsed) ? parsed : [parsed, parsed?.result].filter(Boolean);
        for (const item of candidates) {
            if (item && typeof item === 'object') {
                if (typeof item.id === 'string' && item.id) return item.id;
                if (item.namespace_id) return item.namespace_id;
            }
        }
    } catch {}

    const match = text.match(/[a-f0-9]{32}/i);
    return match ? match[0] : null;
};

const createNamespace = (binding, preview = false) => {
    const cmd = `npx wrangler kv namespace create ${binding}${preview ? ' --preview' : ''}`;
    try {
        const output = run(cmd);
        const id = extractNamespaceId(output);
        if (!id) throw new Error(`未能从输出中解析到 KV ID:\n${output}`);
        return id;
    } catch (err) {
        const stderr = err?.stderr?.toString?.() || err?.message || String(err);
        throw new Error(`执行失败: ${cmd}\n${stderr}\n请确认已先执行: npx wrangler login`);
    }
};

const updateWranglerToml = (filePath, binding, id, previewId) => {
    if (!fs.existsSync(filePath)) {
        throw new Error(`未找到文件: ${filePath}`);
    }

    let content = fs.readFileSync(filePath, 'utf8');
    const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockRegex = new RegExp(
        `(\\[\\[kv_namespaces\\]\\][\\s\\S]*?binding\\s*=\\s*"${escapedBinding}"[\\s\\S]*?id\\s*=\\s*")[^"]*("[\\s\\S]*?preview_id\\s*=\\s*")[^"]*(")`,
        'm'
    );

    if (blockRegex.test(content)) {
        content = content.replace(blockRegex, `$1${id}$2${previewId}$3`);
    } else {
        content += `\n\n[[kv_namespaces]]\nbinding = "${binding}"\nid = "${id}"\npreview_id = "${previewId}"\n`;
    }

    fs.writeFileSync(filePath, content, 'utf8');
};

const main = () => {
    console.log(`开始创建并绑定 KV，binding = ${BINDING}`);
    const id = createNamespace(BINDING, false);
    const previewId = createNamespace(BINDING, true);
    updateWranglerToml(WRANGLER_TOML, BINDING, id, previewId);

    console.log('\n✅ KV 创建并写入 wrangler.toml 完成');
    console.log(`- id: ${id}`);
    console.log(`- preview_id: ${previewId}`);
    console.log(`- file: ${WRANGLER_TOML}`);
};

main();
