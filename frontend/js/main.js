function openGame(gameName) {
  const paths = {
    "swipe-god": "/games/swipe-god/index.html",
    "math-runner": "/games/math-runner/index.html"
  };

  // POP OUT WINDOW
  const width = 1000;
  const height = 700;

  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;

  window.open(
    paths[gameName],
    "_blank",
    `width=${width},height=${height},top=${top},left=${left}`
  );
}