import React, { useEffect } from "react";
import "./App.css";
import useWave from "./useWave";

function App() {
  const { toggle, destroy, reload } = useWave();

  return (
    <div className="App">
      <div id="wavesurfer"></div>

      <button onClick={destroy}>destory</button>
      <button onClick={reload}>reload</button>
      <button onClick={toggle}>play</button>
    </div>
  );
}

export default App;
