const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '../public/SavanaLogo.jpg');
const outputPath = path.join(__dirname, '../public/icon.ico');

// Read the image and convert to ICO
pngToIco(inputPath)
    .then(buf => {
        fs.writeFileSync(outputPath, buf);
        console.log('✅ Icon converted successfully:', outputPath);
    })
    .catch(err => {
        console.error('❌ Error converting icon:', err);
    });
