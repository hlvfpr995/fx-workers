const path = require('node:path');
const {execSync} = require('node:child_process');

const ROOT = process.cwd();
const setupScript = path.join(ROOT, 'scripts', 'setup-kv-binding.js');

const BINDING = process.argv[2] || 'CONFIG_KV';
const KV_TITLE = process.argv[3] || 'fxkv';

const run = (cmd) => {
    console.log(`\n> ${cmd}`);
    execSync(cmd, {stdio: 'inherit'});
};

const main = () => {
    console.log(`开始一键部署：自动创建/复用 KV 并绑定后再部署`);
    run(`node "${setupScript}" ${BINDING} ${KV_TITLE}`);
    run('npx wrangler deploy');
    console.log('\n✅ 部署完成');
};

main();
