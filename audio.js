let repeat = 20;
const fs = require("fs");

const buffer = fs.readFileSync("demo.wav");
console.log(buffer.slice(36, 40).toString());

const audioLen = (buffer.length - 44) * repeat;
const dataLen = audioLen + 36;

const bytes = [];

while (repeat) {
  repeat--;
  bytes.push(buffer.slice(44));
}

const head = buffer.slice(0, 44);
head[4] = (dataLen >> 0) & 0xff;
head[5] = (dataLen >> 8) & 0xff;
head[6] = (dataLen >> 16) & 0xff;
head[7] = (dataLen >> 24) & 0xff;

head[40] = (audioLen >> 0) & 0xff;
head[41] = (audioLen >> 8) & 0xff;
head[42] = (audioLen >> 16) & 0xff;
head[43] = (audioLen >> 24) & 0xff;

fs.writeFileSync(
  "/Users/owenwang/Documents/nginx/docs/test.wav",
  Buffer.concat([head, ...bytes])
);
