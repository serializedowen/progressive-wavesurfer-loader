import Observer from "./wavesurfer/util/observer";
import Axios from "axios";

export const PENDING = Symbol("PENDING");
export const IDLE = Symbol("IDLE");
export const FINISHED = Symbol("FINISHED");

function getWavHeaderInfo(buffer: ArrayBuffer) {
  const firstBuffer = buffer;
  // 创建数据视图来操作数据
  const dv = new DataView(firstBuffer);
  // 从数据视图拿出数据
  const dvList = [];
  for (let i = 0, len = dv.byteLength; i < len; i += 1) {
    dvList.push(dv.getInt8(i));
  }
  // 找到头部信息中的data字段位置
  const findDataIndex = dvList.join().indexOf(",100,97,116,97");
  if (findDataIndex <= -1) {
    throw new Error("解析失败");
  }
  // data 字段之前所有的数据信息字符串
  const dataAheadString = dvList.join().slice(0, findDataIndex);
  //  data 字段之后 8位 是 头部信息的结尾
  const headerEndIndex = dataAheadString.split(",").length + 7;
  // 截取全部的头部信息
  const headerBuffer = firstBuffer.slice(0, headerEndIndex + 1);

  return headerBuffer;
}

type RequestDispatcherOptions = {
  responseType: "arraybuffer" | "blob";
  rangeFirstSize: number;
  rangeSize: number;
  loadRangeSuccess?: any;
};

type RangeData = {
  index: number;
  start: number;
  end: number;
  status: Symbol;
  data?: ArrayBuffer;
  peaks?: number[];
};

class RequestDispatcher extends Observer {
  static defaultOptions = {
    responseType: "arraybuffer",
    rangeFirstSize: 100,
    rangeSize: 1024000 * 3,
    peakSize: 11148, // calculate it
    loadRangeSuccess: null, // 每一段请求之后完成的回调
  };

  url!: string;
  rangeList: RangeData[];
  options!: RequestDispatcherOptions;
  headerBuffer!: ArrayBuffer;
  rangeLoadedCount: number;
  decodedCount: number;

  constructor() {
    super();
    this.rangeList = [];
    this.rangeLoadedCount = 0;
    this.decodedCount = 0;
  }

  mergeOptions(options: RequestDispatcherOptions) {
    this.options = Object.assign({}, RequestDispatcher.defaultOptions, options);
  }

  buildRangeList(fileSize: number) {
    // 根据文件头所带的文件大小 计算需要请求的每一段大小 范围队列
    let rangeStart = this.options.rangeFirstSize;
    for (let i = 0; rangeStart < fileSize; i += 1) {
      const rangeItem = {
        index: i + 1,
        start: rangeStart,
        end: rangeStart + this.options.rangeSize - 1,
        status: IDLE,
      };
      this.rangeList.push(rangeItem);
      rangeStart += this.options.rangeSize;
    }
  }

  readBytesRange(range: RangeData) {
    const { start, end } = range;
    return Axios.get(this.url, {
      responseType: this.options.responseType,
      headers: {
        Range: `bytes=${start}-${end}`,
      },
    });
  }

  loadBlocks(url: string, options: RequestDispatcherOptions) {
    this.url = url;
    this.mergeOptions(options);

    this.rangeList.push({
      index: 0,
      start: 0,
      end: this.options.rangeFirstSize - 1,
      status: PENDING,
    });

    this.on("request-block", (index: number) => {
      console.warn("requesting", index);
      if (index >= this.rangeList.length) throw new Error("index out of bound");

      if (this.rangeList[index].status === IDLE) {
        return this.readBytesRange(this.rangeList[index]).then((response) => {
          return this.rangeLoaded(response.data, this.rangeList[index], true);
        });
      } else {
        return Promise.resolve(this.rangeList[index]);
      }
    });

    return this.readBytesRange(this.rangeList[0]).then((response) => {
      const fileRange = response.headers["content-range"].match(/\d+/g);
      const fileSize = parseInt(fileRange[2], 10);

      this.buildRangeList(fileSize);
      this.headerBuffer = getWavHeaderInfo(response.data);

      this.rangeLoaded(response.data, this.rangeList[0], false);
    });
  }

  rangeLoaded(data: ArrayBuffer, range: RangeData, patchHeader = true) {
    let blob: Blob;

    if (patchHeader) {
      blob = new Blob([this.headerBuffer, data], { type: "audio/wav" });
    } else {
      blob = new Blob([data], { type: "audio/wav" });
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.readAsArrayBuffer(blob);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (err) => reject(err);
    })
      .then((buffer) => {
        range.data = buffer as ArrayBuffer;

        if (
          this.options.loadRangeSuccess &&
          typeof this.options.loadRangeSuccess === "function"
        ) {
          return this.options.loadRangeSuccess(range);
        }
      })
      .finally(() => {
        this.rangeLoadedCount++;

        delete range.data;
        range.status = FINISHED;
      });
  }
}

export default RequestDispatcher;
