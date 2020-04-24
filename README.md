# wavesurfer lazyload for huge audio files

- download and deploy your copy of nginx
- replace nginx.conf with config file found in this folder
- `npm start` and navigate to http://localhost:5000/app
- `node audio.js ${repeatsize}` will generate .wav file for testing (change directory path in script accordingly)

TODO: partial render (only render loaded part of waveform) for wavesurfer canvases. (current wavesurfer distribution seems to be bugged)
