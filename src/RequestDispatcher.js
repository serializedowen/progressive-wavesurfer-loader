import axios from "axios";

class RequestDispatcher {
  defaultOptions = {
    responseType: "arraybuffer",
    rangeFirstSize: 100,
    rangeSize: 1024000 * 3,
    requestCount: 1, // 请求个数
    loadRangeSuccess: null, // 每一段请求之后完成的回调
    loadAllSuccess: null, // 全部加载完成之后的回调
  };

  // 合并配置
  mergeOptions(options) {
    this.options = Object.assign({}, this.defaultOptions, options);
  }

  loadBlocks(url, options) {
    if (!url || typeof url !== "string") {
      throw new Error("Argument [url] should be supplied a string");
    }
    this.mergeOptions(options);
    this.url = url;
    this.rangeList = [];
    this.rangeLoadIndex = 0; // 当前请求的索引
    this.rangeLoadedCount = 0; // 当前已经请求个数

    this.decodedCount = 1;

    // 先取 100 个字节长度的资源以便获取资源头信息
    this.rangeList.push({ start: 0, end: this.options.rangeFirstSize - 1 });
    this.loadFirstRange();
  }

  // 真正发起请求
  requestRange(rangeArgument) {
    const range = rangeArgument;
    const { CancelToken } = axios;
    const requestOptions = {
      url: this.url,
      method: "get",
      responseType: this.options.responseType,
      headers: {
        Range: `bytes=${range.start}-${range.end}`,
      },
      // 配置一个可取消请求的扩展
      cancelToken: new CancelToken((c) => {
        range.cancel = c;
      }),
    };
    return axios.request(requestOptions);
  }

  fileBlock(fileSize) {
    // 根据文件头所带的文件大小 计算需要请求的每一段大小 范围队列
    let rangeStart = this.options.rangeFirstSize;
    for (let i = 0; rangeStart < fileSize; i += 1) {
      const rangeItem = {
        start: rangeStart,
        end: rangeStart + this.options.rangeSize - 1,
      };
      this.rangeList.push(rangeItem);
      rangeStart += this.options.rangeSize;
    }
  }

  getWavHeaderInfo(buffer) {
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

  // 请求第一段
  loadFirstRange() {
    this.requestRange(this.rangeList[this.rangeLoadIndex])
      .then((response) => {
        const fileRange = response.headers["content-range"].match(/\d+/g);
        // 获取文件大小
        const fileSize = parseInt(fileRange[2], 10);
        // 计算请求块
        this.fileBlock(fileSize);
        // 放置请求结果到请求队列中的data字段
        this.rangeList[0].data = response.data;
        // 获取资源头部信息 (方法同第二步)
        this.headerBuffer = this.getWavHeaderInfo(response.data);

        // 每一段加载完成之后处理回调
        this.afterRangeLoaded();
        // 加载剩下的
        this.loadOtherRanges();
      })
      .catch((error) => {
        throw new Error(error);
      });
    this.rangeLoadIndex += 1;
  }

  afterRangeLoaded() {
    this.rangeLoadedCount += 1;
    // 每一次请求道数据之后 判断当前请求索引和应当请求的所有数量
    // 触发 loadRangeSuccess 和 loadAllSuccess 回调
    if (
      this.rangeLoadedCount > 1 &&
      this.options.loadRangeSuccess &&
      typeof this.options.loadRangeSuccess === "function"
    ) {
      this.contactRangeData(this.options.loadRangeSuccess);
    }
    // if (
    //   this.rangeLoadedCount >= this.rangeList.length &&
    //   this.options.loadAllSuccess &&
    //   typeof this.options.loadAllSuccess === "function"
    // ) {
    //   this.options.loadAllSuccess();
    //   this.rangeList = [];
    // }
  }

  loadOtherRanges() {
    // 循环请求范围队列
    if (this.rangeLoadIndex < this.rangeList.length) {
      this.loadRange(this.rangeList[this.rangeLoadIndex]);
    }
  }

  loadRange(rangeArgument) {
    const range = rangeArgument;
    this.requestRange(range)
      .then((response) => {
        // 放置请求结果到请求队列中的data字段
        range.data = response.data;
        this.afterRangeLoaded();
        this.loadOtherRanges();
      })
      .catch((error) => {
        throw new Error(error);
      });
    this.rangeLoadIndex += 1;
  }

  contactRangeData(callback) {
    const blobIndex = this.rangeLoadIndex - 1;
    if (!this.headerBuffer) {
      return;
    }
    // 从请求队列中的每一个data获取数据，拼接上已经有的header头信息，保存为 audio/wav blob文件
    const blob = new Blob([this.headerBuffer, this.rangeList[blobIndex].data], {
      type: "audio/wav",
    });
    const reader = new FileReader();
    // 将blob读取为 buffer 交给 loadRangeSuccess 回调
    reader.readAsArrayBuffer(blob);
    reader.onload = () => {
      callback({ data: reader.result, index: blobIndex });
    };
    reader.onerror = () => {
      throw new Error(reader.error);
    };
  }

  destroyRequest() {
    // 销毁请求，使用场景是:
    // 如果当前的资源没有加载完成，此时更换了资源的URL地址，应该取消之前设定的请求,避免浪费请求资源
    if (!this.rangeList) {
      return;
    }
    this.rangeList.forEach((rang) => {
      if (rang.cancel) {
        rang.cancel("取消音频下载");
      }
    });
  }
}

export default RequestDispatcher;
