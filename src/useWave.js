import wavesurfer from "./wavesurferEnhanced";
import throttle from "lodash/throttle";
// import Axios from "axios";
import timeline from "./wavesurfer/plugin/timeline";
import RequestDispatcher from "./RequestDispatcher";
import { useRef, useEffect, useState, useCallback } from "react";

export default function useWave() {
  const [load, setload] = useState(0);
  const [flag, setflag] = useState(0);
  const item = useRef({ destroy: null, toggle: null, ws: null, reload: null });
  useEffect(() => {
    console.log("effect");
    item.current = initWave();

    console.log(load);
    setload(load + 1);
    return () => {
      item.current.destroy && item.current.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flag]);

  item.current.reload = useCallback(() => {
    setflag(flag + 1);
  }, [flag]);

  return item.current;
}

function initWave() {
  let ws = wavesurfer.create({
    container: "#waveform",
    waveColor: "violet",
    backend: "MediaElement",
    responsive: true,
    fillParent: false,
    plugins: [
      timeline.create({
        container: "#timeline",
      }),
    ],
  });

  window.ws = ws;

  ws.once("ready", () => {
    let peaksList = new Array(ws.getWaveLength() + 2);
    peaksList.fill(0);

    let requestDispatcher = new RequestDispatcher();

    window.rd = requestDispatcher;

    requestDispatcher.loadBlocks("http://localhost:5000/test.wav", {
      loadRangeSuccess(range) {
        return ws
          .getPeaks(range.data)
          .then((peaks) => {
            requestDispatcher.decodedCount++;
            range.peaks = peaks;

            if (range.index > 0) {
              const start =
                (range.index - 1) * requestDispatcher.options.peakSize;

              console.log(start, range.peaks.length);
              peaksList.splice(start, range.peaks.length, ...range.peaks);

              console.log(peaksList);
              // peaksList[range.index - 1] = peaks;

              if (
                requestDispatcher.rangeList.length ===
                requestDispatcher.decodedCount
              ) {
                // requestDispatcher = null;
              } else {
                // ws.loadPeakRange(peaksList);
              }
              ws.loadPeaks(peaksList);
            }
          })
          .catch(console.log);
      },
    });

    const handler = throttle((timeStamp) => {
      const index = Math.floor(
        0.02 +
          (ws.backend.getPlayedPercents() * peaksList.length) /
            requestDispatcher.options.peakSize
      );

      requestDispatcher.fireEvent("request-block", index + 1);
    }, 1000);

    ws.on("audioprocess", handler);

    ws.on("destroy", () => {
      console.log("destroy");
      requestDispatcher = null;
      ws.unAll();
    });
    window.rd = requestDispatcher;
  });

  ws.load("http://localhost:5000/test.wav", [], "none");
  // ws.load("http://localhost:5000/test.wav");

  ws.on("error", console.log);

  return {
    toggle: function () {
      if (!ws) {
        return;
      }
      return ws.isPlaying() ? ws.pause() : ws.play();
    },

    destroy: function () {
      if (!ws) {
        return;
      }
      ws.destroy();
      ws = null;
    },

    ws,
  };
}
