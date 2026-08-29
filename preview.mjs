import sharp from 'sharp';
import fs from 'fs';
const buf = await sharp('./vector-dragon-logo-yinyang.png').toBuffer();
const b64 = buf.toString('base64');
const html = `<img src="data:image/png;base64,${b64}" style="max-width:600px">`;
fs.writeFileSync('preview.html', html);
console.log('preview.html written');
