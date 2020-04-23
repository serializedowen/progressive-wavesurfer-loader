import wavesurfer from "./wavesurfer/wavesurfer";
import RequestDispatcher from "./RequestDispatcher";
import flatten from "lodash/flatten";
import throttle from "lodash/throttle";
import Axios from "axios";
import RequestDispatcher2 from "./RequestDispatcher2";

wavesurfer.prototype.loadPeaks = function (peaks) {
  this.backend.buffer = null;
  this.backend.setPeaks(flatten(peaks));
  this.drawBuffer();
  this.fireEvent("waveform-ready");
  this.isReady = true;
};

wavesurfer.prototype.drawBufferRange = function (start = 0, end = 2000) {
  const nominalWidth = Math.round(
    this.getDuration() * this.params.minPxPerSec * this.params.pixelRatio
  );
  const parentWidth = this.drawer.getWidth();
  let width = nominalWidth;

  let peaks;

  console.log(start, end, width);

  peaks = this.backend.getPeaks(width, start, end);
  this.drawer.drawPeaks(peaks, width, 200, 400);

  this.fireEvent("redraw", peaks, width);
};

wavesurfer.prototype.loadPeakRange = function (range) {
  // console.log(range.peaks);
  this.backend.setPeaks(range.peaks);
  this.drawBufferRange(0, 2000);
};

wavesurfer.prototype.getPeaks = function (arraybuffer, callback) {
  return new Promise((resolve, reject) => {
    this.decodeArrayBuffer(
      arraybuffer,
      (buffer) => {
        if (!this.isDestroyed) {
          this.backend.buffer = buffer;
          this.backend.setPeaks(null);
          const nominalWidth = Math.round(
            this.getDuration() *
              this.params.minPxPerSec *
              this.params.pixelRatio
          );

          const parentWidth = this.drawer.getWidth();
          let width = nominalWidth;
          let start = 0;
          // 此处谨记 end 一定要赋值为 width
          // 原本的 let end = Math.max(start + parentWidth, width) 是比较了容器宽度和根据音频时长等计算出的长度，取最大值。
          // 那么会在当前的音频分段时长大小(例子是2M音频的时长)所能产生的波形长度小于容器的宽度时
          // 出现为了充满容器下面的 this.backend.getPeaks 方法在实际产生的波形信息后面添加不等位数的 0，从而充满容器。
          // 但是整个大音频的时长是固定的，根据大音频时长设定的canvas的个数和宽度已经固定
          // 如果分段加载之后最后一段如果出现被补0的情况，在最终合并的完整的波形信息就会超过原本设定的预值，导致挤压最终产生的波形
          let end = width;

          if (
            this.params.fillParent &&
            (!this.params.scrollParent || nominalWidth < parentWidth)
          ) {
            width = parentWidth;
          }

          const peaks = this.backend.getPeaks(width, start, end);

          if (callback && typeof callback == "function") {
            callback(peaks);
          }

          // 清空 arraybuffer 避免占用过多内存
          this.arraybuffer = null;
          this.backend.buffer = null;

          resolve(peaks);
        }
      },
      () => {
        reject("error");
        this.fireEvent("error", "Error decoding audiobuffer");
      }
    );
  });
};

const ws = wavesurfer.create({
  container: "#waveform",
  waveColor: "violet",
  backend: "MediaElement",
  responsive: true,
  fillParent: false,
});

window.ws = ws;

const decode = ws.decodeArrayBuffer;
function modDecode(...args) {
  // const buffer = args[0];
  const cb = args[1];
  const start = Date.now();

  args[1] = (...args) => {
    console.log("elapsed: " + (Date.now() - start));
    cb(...args);
  };

  decode.call(ws, ...args);
}

ws.decodeArrayBuffer = modDecode;

ws.on("ready", () => console.error("ready"));

export function toggle() {
  return ws.isPlaying() ? ws.pause() : ws.play();
}

export default function useWave() {
  let peaksList = [];
  // let requestWav = new RequestDispatcher();

  let requestWav = new RequestDispatcher2();

  // Axios.head("http://localhost:5000/test.wav").then((res) => {
  //   console.log(res.headers["content-length"]);
  // });

  requestWav.loadBlocks("http://localhost:5000/test.wav", {
    loadRangeSuccess(range) {
      peaksList[range.index - 1] = [];
      // 调用扩展的 waveSurfer 方法获取每一段音频的 peaks
      return ws.getPeaks(range.data).then((peaks) => {
        requestWav.decodedCount += 1;
        peaksList[range.index - 1] = peaks;

        range.peaks = peaks;

        if (requestWav.rangeList.length === requestWav.decodedCount) {
          ws.loadPeaks(peaksList);
          // requestWav = null;
        } else {
          ws.loadPeakRange(range);
        }
      });
    },
  });

  const handler = throttle((timeStamp) => {
    requestWav.fireEvent("request-block", Math.floor(timeStamp / 10));
  }, 1000);

  ws.on("audioprocess", handler);

  window.wv = requestWav;

  ws.load("http://localhost:5000/test.wav", [], "none");
  // ws.load("http://localhost:5000/test.wav");

  ws.on("error", console.log);
}
