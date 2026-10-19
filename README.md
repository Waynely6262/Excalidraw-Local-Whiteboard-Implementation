# Excalidraw-Local-Whiteboard-Implementation

## About
This project integrates the open-sourced Excalidraw program with, currently,
an auto-save which writes the file to the folder you selected. It features a "New File" button 
which moves onto a new save target and wipes your current work, and a "Branch" button
which moves onto a new save target without wiping your current board.

Although excalidraw already provides import and export features, I found them to be hard to depend on; local saves are stored in browser data which may be cleared from time to time, and Excalidraw does not auto-save. In order for me to focus on my work, this is more of a personalized customization of behaviour.


## Dependencies
This program depends on Excalidraw, and uses Vite. These should be automatically installed once you run `npm install`.

Excalidraw: https://github.com/excalidraw/excalidraw

To access the running build, visit `http://localhost:5173/` on your browser.
**You may need to use Chrome or Microsoft Edge**

The following are the steps to install (using terminal):

```
git clone https://github.com/Waynely6262/Excalidraw-Local-Whiteboard-Implementation/
cd Excalidraw-Local-Whiteboard-Implementation
npm install
npm run dev
```







## Note
The framework of this repository was made using Claude Sonnet 5.5
