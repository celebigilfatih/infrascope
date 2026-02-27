const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '../public/images/favicon.svg');
const icoPath = path.join(__dirname, '../public/images/favicon.ico');

async function generateFavicon() {
  const svg = fs.readFileSync(svgPath);
  
  // Generate PNG buffers for different sizes
  const sizes = [16, 32, 48, 64, 128, 256];
  const pngBuffers = await Promise.all(
    sizes.map(size => 
      sharp(svg)
        .resize(size, size)
        .png()
        .toBuffer()
    )
  );
  
  // Create ICO file manually (simple version with PNG inside)
  // ICO header
  const numImages = pngBuffers.length;
  const headerSize = 6 + (numImages * 16);
  
  // Calculate offsets
  let offset = headerSize;
  const offsets = pngBuffers.map(buf => {
    const currentOffset = offset;
    offset += buf.length;
    return currentOffset;
  });
  
  // Build ICO file
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0); // Reserved
  icoHeader.writeUInt16LE(1, 2); // Type: 1 = ICO
  icoHeader.writeUInt16LE(numImages, 4); // Number of images
  
  // Directory entries
  const dirEntries = [];
  for (let i = 0; i < numImages; i++) {
    const entry = Buffer.alloc(16);
    const size = sizes[i];
    entry.writeUInt8(size === 256 ? 0 : size, 0); // Width (0 = 256)
    entry.writeUInt8(size === 256 ? 0 : size, 1); // Height (0 = 256)
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(pngBuffers[i].length, 8); // Size of image data
    entry.writeUInt32LE(offsets[i], 12); // Offset to image data
    dirEntries.push(entry);
  }
  
  // Combine all parts
  const ico = Buffer.concat([
    icoHeader,
    ...dirEntries,
    ...pngBuffers
  ]);
  
  fs.writeFileSync(icoPath, ico);
  console.log('✅ Favicon ICO created:', icoPath);
  console.log('   Sizes:', sizes.join(', '));
}

generateFavicon().catch(console.error);
