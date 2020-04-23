import React from "react";
import "./App.css";
import useWave, { toggle } from "./useWave";
function App() {
  useWave();

  return (
    <div className="App">
      <div id="wavesurfer"></div>

      <button onClick={useWave}>reload</button>
      <button onClick={toggle}>play</button>
    </div>
  );
}

export default App;
