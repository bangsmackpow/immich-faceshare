import sharp from 'sharp';
import { mkdirSync, copyFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svgPath = join(root, 'logo.svg');
const publicDir = join(root, 'apps', 'web', 'public');

// Ensure icons directory exists
const iconsDir = join(publicDir, 'icons');
mkdirSync(iconsDir, { recursive: true });

async function generateFavicons() {
  const sizes = [
    { name: 'favicon-16x16.png', size: 16 },
    { name: 'favicon-32x32.png', size: 32 },
    { name: 'favicon-96x96.png', size: 96 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'web-app-manifest-192x192.png', size: 192 },
    { name: 'web-app-manifest-512x512.png', size: 512 },
  ];

  for (const { name, size } of sizes) {
    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(join(publicDir, name));
    console.log(`✓ ${name}`);
  }

  // Copy SVG as favicon.svg
  copyFileSync(svgPath, join(publicDir, 'favicon.svg'));
  console.log('✓ favicon.svg');

  // Create favicon.ico (multi-resolution: 16, 32, 48)
  const icoSizes = [16, 32, 48];
  const icoBuffers = await Promise.all(
    icoSizes.map(size =>
      sharp(svgPath)
        .resize(size, size)
        .png()
        .toBuffer()
    )
  );

  // Simple ICO format: Header + Directory + Images
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: 1 = ICO
  header.writeUInt16LE(icoSizes.length, 4); // Number of images

  const directory = Buffer.alloc(icoSizes.length * 16);
  let offset = header.length + directory.length;
  const images: Buffer[] = [];

  for (let i = 0; i < icoSizes.length; i++) {
    const size = icoSizes[i];
    const img = icoBuffers[i];

    directory.writeUInt8(size, i * 16); // Width
    directory.writeUInt8(size, i * 16 + 1); // Height
    directory.writeUInt8(0, i * 16 + 2); // Color palette
    directory.writeUInt8(0, i * 16 + 3); // Reserved
    directory.writeUInt16LE(1, i * 16 + 4); // Color planes
    directory.writeUInt16LE(32, i * 16 + 6); // Bits per pixel
    directory.writeUInt32LE(img.length, i * 16 + 8); // Image size
    directory.writeUInt32LE(offset, i * 16 + 12); // Image offset

    images.push(img);
    offset += img.length;
  }

  const ico = Buffer.concat([header, directory, ...images]);
  writeFileSync(join(publicDir, 'favicon.ico'), ico);
  console.log('✓ favicon.ico');

  // Create site.webmanifest
  const manifest = {
    name: 'FaceShare',
    short_name: 'FaceShare',
    icons: [
      {
        src: '/web-app-manifest-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/web-app-manifest-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    theme_color: '#18181b',
    background_color: '#18181b',
    display: 'standalone',
  };

  writeFileSync(
    join(publicDir, 'site.webmanifest'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
  console.log('✓ site.webmanifest');

  console.log('\nAll favicons generated!');
}

generateFavicons().catch(console.error);
