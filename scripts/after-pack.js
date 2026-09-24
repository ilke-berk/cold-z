// electron-builder afterPack kancası: geliştirici makinesindeki .env varsa
// paketin resources/ klasörüne seed.env olarak kopyalar. server.js paketli ilk
// açılışta bunu userData/.env'ye alır (tak-çalıştır kurulum: alıcı API anahtarı
// girmez). .env yoksa (CI) hiçbir şey yapılmaz; kurulum eskisi gibi Ayarlar
// ekranından anahtar ister.
const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
    const src = path.join(context.packager.projectDir, '.env');
    if (!fs.existsSync(src)) { console.log('  • seed.env: .env yok, tohum eklenmedi'); return; }
    const resDir = path.join(context.appOutDir, 'resources');
    fs.mkdirSync(resDir, { recursive: true });
    fs.copyFileSync(src, path.join(resDir, 'seed.env'));
    console.log('  • seed.env: .env tohum olarak resources/ içine kopyalandı');
};
