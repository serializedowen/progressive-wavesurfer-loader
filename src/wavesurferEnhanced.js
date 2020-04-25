import wavesurfer from "./wavesurfer/wavesurfer";
import flatten from "lodash/flatten";
import { FINISHED } from "./RequestDispatcher";

wavesurfer.prototype.loadPeaks = function (peaks) {
  this.backend.buffer = null;
  this.backend.setPeaks(peaks);
  this.drawBuffer();
  this.fireEvent("waveform-ready");
  this.isReady = true;
};

wavesurfer.prototype.loadPeakRange = function (requestDispatcher) {
  const placeHolder = new Array(requestDispatcher.options.peakSize);
  placeHolder.fill(0);

  const peaks = flatten(
    requestDispatcher.rangeList.map((range) => {
      if (range.status === FINISHED) {
        console.log(range.peaks);
        return range.peaks;
      } else {
        return placeHolder;
      }
    })
  );
  this.backend.setPeaks(peaks);
  this.drawBuffer();
};

wavesurfer.prototype.getWaveLength = function (duration) {
  const length = duration || this.getDuration();
  return Math.round(
    length * this.params.minPxPerSec * this.params.pixelRatio * 2
  );
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

class wavesurferEnhanced extends wavesurfer {
  static create(...args) {
    const inst = super.create(...args);

    const decode = inst.decodeArrayBuffer;
    function timedDecode(...args) {
      // const buffer = args[0];
      const cb = args[1];
      const start = Date.now();

      args[1] = (...args) => {
        console.log("elapsed: " + (Date.now() - start));
        cb(...args);
      };

      decode.call(inst, ...args);
    }

    inst.decodeArrayBuffer = timedDecode;

    console.log(inst);

    return inst;
  }
}

export default wavesurferEnhanced;
