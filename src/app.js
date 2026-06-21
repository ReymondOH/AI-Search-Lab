const goalPuzzle = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 0]
];

let puzzle = [
  [8, 1, 3],
  [4, 0, 2],
  [7, 6, 5]
];

let uploadedImage = null;
let puzzleMoves = 0;

// Animation interval id for puzzle solution playback
let puzzleAnimationIntervalId = null;
// History stack for undo (stores {state, moves})
let puzzleHistory = [];
let puzzleAnimationPath = null;
let puzzleAnimationStep = 0;
let puzzleAnimationRunning = false;
let puzzleAnimationPaused = false;

function pushPuzzleHistory() {
  try {
    puzzleHistory.push({ state: copyState(puzzle), moves: puzzleMoves });
    // keep history bounded
    if (puzzleHistory.length > 200) puzzleHistory.shift();
  } catch (e) {
    // ignore history failures
  }
}

function undoPuzzle() {
  // stop any running animation
  if (puzzleAnimationIntervalId) { clearInterval(puzzleAnimationIntervalId); puzzleAnimationIntervalId = null; }
  puzzleAnimationPath = null; puzzleAnimationStep = 0; puzzleAnimationRunning = false; puzzleAnimationPaused = false;

  if (!puzzleHistory.length) {
    updatePuzzleStatus("Nothing to undo.");
    return;
  }

  const last = puzzleHistory.pop();
  puzzle = copyState(last.state);
  puzzleMoves = last.moves || 0;
  renderPuzzle();
  updatePuzzleStatus();
  // disable pause/resume since animation is stopped
  setPuzzlePauseBtn(false, 'Pause');
}

let tttBoard = ["", "", "", "", "", "", "", "", ""];

function nextPlayerSymbol() {
  const xCount = tttBoard.filter(v => v === "X").length;
  const oCount = tttBoard.filter(v => v === "O").length;
  return xCount <= oCount ? "X" : "O";
}

function getGameMode() {
  return document.getElementById('gameMode')?.value || 'human-ai';
}

function humanIsSymbol() {
  // For human vs AI mode, determine which symbol the human controls
  const mode = getGameMode();
  if (mode !== 'human-ai') return null;
  const first = document.getElementById('firstPlayer')?.value || 'human';
  return first === 'human' ? 'X' : 'O';
}

// AI autoplay control state
let aiIntervalId = null;
let aiPaused = false;
let aiIntervalDelay = 800;
let aiRunning = false;
let aiCurrentPlayer = "X";

function startAIInterval() {
  if (aiIntervalId) clearInterval(aiIntervalId);
  aiIntervalId = setInterval(aiAutoplayStep, aiIntervalDelay);
}

function aiAutoplayStep() {
  if (!aiRunning || aiPaused) return;

  const winner = checkWinner(tttBoard);

  if (winner !== null) {
    stopAIVsAI();
    if (winner === "draw") updateTicTacToeStatus("AI vs AI ended in a draw.");
    else updateTicTacToeStatus(winner + " wins.");
    return;
  }

  if (aiCurrentPlayer === "X") {
    const xAlgorithm = document.getElementById("xAlgorithm").value;
    const moveStart = performance.now();
    const statsX = aiMoveForPlayer("X", xAlgorithm) || { nodes: 0, pruned: 0 };
    const moveEnd = performance.now();
    let pruningRateX = "N/A";
    if (xAlgorithm === "alphabeta") {
      pruningRateX = statsX.nodes + statsX.pruned > 0 ? Math.round((statsX.pruned / (statsX.nodes + statsX.pruned)) * 100) + "%" : "N/A";
    }
    updateDashboard(xAlgorithm.toUpperCase(), Math.round(moveEnd - moveStart), statsX.nodes, 0, pruningRateX);
    aiCurrentPlayer = "O";
  } else {
    const oAlgorithm = document.getElementById("oAlgorithm").value;
    const moveStart = performance.now();
    const statsO = aiMoveForPlayer("O", oAlgorithm) || { nodes: 0, pruned: 0 };
    const moveEnd = performance.now();
    let pruningRateO = "N/A";
    if (oAlgorithm === "alphabeta") {
      pruningRateO = statsO.nodes + statsO.pruned > 0 ? Math.round((statsO.pruned / (statsO.nodes + statsO.pruned)) * 100) + "%" : "N/A";
    }
    updateDashboard(oAlgorithm.toUpperCase(), Math.round(moveEnd - moveStart), statsO.nodes, 0, pruningRateO);
    aiCurrentPlayer = "X";
  }

  renderTicTacToe();
}

function pauseAIVsAI() {
  if (!aiRunning) return;
  aiPaused = true;
  if (aiIntervalId) { clearInterval(aiIntervalId); aiIntervalId = null; }
  updateTicTacToeStatus("AI vs AI paused.");
  const btn = document.getElementById('aiPauseBtn'); if (btn) btn.textContent = 'Resume';
}

function resumeAIVsAI() {
  if (!aiRunning) return;
  aiPaused = false;
  startAIInterval();
  updateTicTacToeStatus("AI vs AI running.");
  const btn = document.getElementById('aiPauseBtn'); if (btn) btn.textContent = 'Pause';
}

function stopAIVsAI() {
  aiRunning = false;
  aiPaused = false;
  if (aiIntervalId) { clearInterval(aiIntervalId); aiIntervalId = null; }
  updateTicTacToeStatus("AI vs AI stopped.");
  const btn = document.getElementById('aiPauseBtn'); if (btn) btn.textContent = 'Pause';
}

function setAISpeed(ms) {
  aiIntervalDelay = ms;
  const display = document.getElementById('aiSpeedValue'); if (display) display.textContent = ms + 'ms';
  if (aiRunning && !aiPaused) {
    startAIInterval();
  }
}

function showModule(module) {
  document.getElementById("puzzleModule").classList.add("hidden");
  document.getElementById("tictactoeModule").classList.add("hidden");

  if (module === "puzzle") {
    document.getElementById("puzzleModule").classList.remove("hidden");
    setSolutionLengthVisibility(true);
    setPruningRateVisibility(false);
  } else {
    document.getElementById("tictactoeModule").classList.remove("hidden");
    // Show pruning rate only if either selected AI is Alpha-Beta
    const xAlg = document.getElementById("xAlgorithm")?.value;
    const oAlg = document.getElementById("oAlgorithm")?.value;
    const showPruning = xAlg === "alphabeta" || oAlg === "alphabeta";
    setSolutionLengthVisibility(false);
    setPruningRateVisibility(showPruning);
  }
}

function setSolutionLengthVisibility(show) {
  const el = document.getElementById('solutionLength');
  if (!el || !el.parentElement) return;
  el.parentElement.style.display = show ? '' : 'none';
}

function setPruningRateVisibility(show) {
  const el = document.getElementById('pruningRate');
  if (!el || !el.parentElement) return;
  el.parentElement.style.display = show ? '' : 'none';
}

function updateDashboard(algorithm, time, nodes, length, pruning = "N/A") {
  document.getElementById("algorithm").textContent = algorithm;
  document.getElementById("time").textContent = time + " ms";
  document.getElementById("nodes").textContent = nodes;
  document.getElementById("solutionLength").textContent = length;
  document.getElementById("pruningRate").textContent = pruning;
}

function updatePuzzleStatus(message) {
  const status = document.getElementById("puzzleStatus");
  if (status) status.textContent = message || "Moves: " + puzzleMoves;
}

function renderPuzzle() {
  const board = document.getElementById("puzzleBoard");
  board.innerHTML = "";

  const flatPuzzle = puzzle.flat();

  flatPuzzle.forEach(value => {
    const tile = document.createElement("div");
    tile.className = value === 0 ? "tile blank" : "tile";

    if (uploadedImage && value !== 0) {
      const row = Math.floor((value - 1) / 3);
      const col = (value - 1) % 3;

      tile.style.backgroundImage =
        `url(${uploadedImage.src})`;

      tile.style.backgroundSize = "270px 270px";

      tile.style.backgroundPosition =
        `${-col * 90}px ${-row * 90}px`;

      tile.textContent = "";
    } else {
      tile.textContent = value === 0 ? "" : value;
    }

    tile.onclick = () => moveTile(value);

    board.appendChild(tile);
  });

  updatePuzzleStatus();
}

function moveTile(value) {
  if (value === 0) return;

  let tileRow, tileCol;
  let blankRow, blankCol;

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (puzzle[r][c] === value) {
        tileRow = r;
        tileCol = c;
      }

      if (puzzle[r][c] === 0) {
        blankRow = r;
        blankCol = c;
      }
    }
  }

  const distance =
    Math.abs(tileRow - blankRow) +
    Math.abs(tileCol - blankCol);

  if (distance === 1) {
    // record previous state for undo
    pushPuzzleHistory();

    puzzle[blankRow][blankCol] = value;
    puzzle[tileRow][tileCol] = 0;
    puzzleMoves++;

    renderPuzzle();

    if (isGoal(puzzle)) {
      updatePuzzleStatus("Puzzle solved in " + puzzleMoves + " moves.");
      alert("Puzzle Solved!");
    }
  }
}

function resetPuzzle() {
  // stop any ongoing solution animation
  if (puzzleAnimationIntervalId) { clearInterval(puzzleAnimationIntervalId); puzzleAnimationIntervalId = null; }
  puzzleAnimationPath = null; puzzleAnimationStep = 0; puzzleAnimationRunning = false; puzzleAnimationPaused = false;
  // record state so reset can be undone
  pushPuzzleHistory();
  puzzle = [
    [8, 1, 3],
    [4, 0, 2],
    [7, 6, 5]
  ];
  puzzleMoves = 0;
  renderPuzzle();
  updateDashboard("None", 0, 0, 0);
  // disable pause/resume since animation is stopped
  setPuzzlePauseBtn(false, 'Pause');
}

function shufflePuzzle() {
  // stop any ongoing solution animation
  if (puzzleAnimationIntervalId) { clearInterval(puzzleAnimationIntervalId); puzzleAnimationIntervalId = null; }
  puzzleAnimationPath = null; puzzleAnimationStep = 0; puzzleAnimationRunning = false; puzzleAnimationPaused = false;
  // record state so shuffle can be undone
  pushPuzzleHistory();
  puzzle = copyState(goalPuzzle);
  puzzleMoves = 0;

  for (let i = 0; i < 100; i++) {
    const neighbors = getNeighbors(puzzle);
    const randomIndex = Math.floor(Math.random() * neighbors.length);
    puzzle = neighbors[randomIndex];
  }

  renderPuzzle();
  updateDashboard("Shuffle", 0, 0, 0);
  // disable pause/resume since animation is stopped
  setPuzzlePauseBtn(false, 'Pause');
}

function solvePuzzle(type) {
  const startTime = performance.now();
  let result = null;

  if (type === "bfs") result = bfs(puzzle);
  else if (type === "dijkstra") result = dijkstra(puzzle);
  else if (type === "astar") result = astar(puzzle);
  else if (type === "greedy") result = greedyBestFirst(puzzle);
  else if (type === "idastar") result = idastar(puzzle);

  if (!result || !result.path) {
    alert("No solution found.");
    return;
  }

  const endTime = performance.now();

  updateDashboard(
    type.toUpperCase(),
    Math.round(endTime - startTime),
    result.nodes,
    result.path.length - 1
  );

  puzzleMoves = 0;
  // record current state so the animated solution can be undone step-by-step
  pushPuzzleHistory();
  animateSolution(result.path);
  // We're in Module A (puzzle) so show solution length and hide pruning rate
  setSolutionLengthVisibility(true);
  setPruningRateVisibility(false);
}

function solveSelectedPuzzle() {
  const sel = document.getElementById('puzzleAlgorithm');
  const type = sel ? sel.value : 'astar';
  solvePuzzle(type);
}

function greedyBestFirst(start) {
  // Priority by heuristic only (Manhattan distance)
  const queue = [{ state: start, path: [start], priority: manhattanDistance(start) }];
  const visited = new Set();
  let nodes = 0;

  while (queue.length > 0) {
    queue.sort((a, b) => a.priority - b.priority);
    const current = queue.shift();
    const key = stateToString(current.state);

    if (visited.has(key)) continue;
    visited.add(key);
    nodes++;

    if (isGoal(current.state)) {
      return { path: current.path, nodes };
    }

    for (const neighbor of getNeighbors(current.state)) {
      const p = manhattanDistance(neighbor);
      queue.push({ state: neighbor, path: [...current.path, neighbor], priority: p });
    }
  }
  return null;
}

function idastar(start) {
  // Iterative Deepening A* using Manhattan distance
  const startKey = stateToString(start);
  let bound = manhattanDistance(start);
  let nodes = 0;

  const search = (state, g, bound, path, visitedKeys) => {
    nodes++;
    const f = g + manhattanDistance(state);
    if (f > bound) return { status: 'cutoff', min: f };
    if (isGoal(state)) return { status: 'found', path };

    let min = Infinity;

    for (const neighbor of getNeighbors(state)) {
      const key = stateToString(neighbor);
      if (visitedKeys.has(key)) continue;
      visitedKeys.add(key);
      const res = search(neighbor, g + 1, bound, [...path, neighbor], visitedKeys);
      visitedKeys.delete(key);

      if (res.status === 'found') return res;
      if (res.status === 'cutoff' && res.min < min) min = res.min;
    }

    return { status: 'cutoff', min };
  };

  while (true) {
    const visitedKeys = new Set([startKey]);
    const res = search(start, 0, bound, [start], visitedKeys);
    if (res.status === 'found') return { path: res.path, nodes };
    if (res.min === Infinity) return null; // no solution
    bound = res.min;
  }
}

function startPuzzleAnimationInterval() {
  if (puzzleAnimationIntervalId) { clearInterval(puzzleAnimationIntervalId); puzzleAnimationIntervalId = null; }
  puzzleAnimationIntervalId = setInterval(() => {
    if (!puzzleAnimationRunning || puzzleAnimationPaused) return;
    if (!puzzleAnimationPath || puzzleAnimationStep >= puzzleAnimationPath.length) {
      if (puzzleAnimationIntervalId) { clearInterval(puzzleAnimationIntervalId); puzzleAnimationIntervalId = null; }
      puzzleAnimationRunning = false;
      return;
    }

    // push previous state so user can undo this step
    pushPuzzleHistory();
    puzzle = copyState(puzzleAnimationPath[puzzleAnimationStep]);
    renderPuzzle();
    updatePuzzleStatus("Solving step-by-step: " + puzzleAnimationStep + " / " + (puzzleAnimationPath.length - 1));
    puzzleAnimationStep++;

    if (puzzleAnimationStep >= puzzleAnimationPath.length) {
      if (puzzleAnimationIntervalId) { clearInterval(puzzleAnimationIntervalId); puzzleAnimationIntervalId = null; }
      puzzleAnimationRunning = false;
      puzzleMoves = puzzleAnimationPath.length - 1;
      updatePuzzleStatus("Solved in " + puzzleMoves + " moves.");
      // disable pause/resume when finished
      setPuzzlePauseBtn(false, 'Pause');
    }
  }, 500);
}

function animateSolution(path) {
  // prepare path and state
  if (puzzleAnimationIntervalId) { clearInterval(puzzleAnimationIntervalId); puzzleAnimationIntervalId = null; }
  puzzleAnimationPath = path.map(p => copyState(p));
  puzzleAnimationStep = 0;
  puzzleAnimationRunning = true;
  puzzleAnimationPaused = false;
  const btn = document.getElementById('puzzlePauseBtn'); if (btn) btn.textContent = 'Pause';
  // enable pause button when animation starts
  setPuzzlePauseBtn(true, 'Pause');
  updatePuzzleStatus("Solving step-by-step: 0 / " + (puzzleAnimationPath.length - 1));
  startPuzzleAnimationInterval();
}

function pausePuzzleAnimation() {
  if (!puzzleAnimationRunning || puzzleAnimationPaused) return;
  puzzleAnimationPaused = true;
  if (puzzleAnimationIntervalId) { clearInterval(puzzleAnimationIntervalId); puzzleAnimationIntervalId = null; }
  const btn = document.getElementById('puzzlePauseBtn'); if (btn) btn.textContent = 'Resume';
  updatePuzzleStatus('Puzzle animation paused.');
  setPuzzlePauseBtn(true, 'Resume');
}

function resumePuzzleAnimation() {
  if (!puzzleAnimationRunning || !puzzleAnimationPaused) return;
  puzzleAnimationPaused = false;
  const btn = document.getElementById('puzzlePauseBtn'); if (btn) btn.textContent = 'Pause';
  setPuzzlePauseBtn(true, 'Pause');
  startPuzzleAnimationInterval();
  updatePuzzleStatus('Solving step-by-step: ' + puzzleAnimationStep + ' / ' + (puzzleAnimationPath ? puzzleAnimationPath.length - 1 : 0));
}

function togglePuzzlePause() {
  if (!puzzleAnimationRunning) return;
  if (puzzleAnimationPaused) resumePuzzleAnimation(); else pausePuzzleAnimation();
}

function setPuzzlePauseBtn(enabled, label) {
  const btn = document.getElementById('puzzlePauseBtn');
  if (!btn) return;
  btn.disabled = !enabled;
  if (label !== undefined && label !== null) btn.textContent = label;
}

function stateToString(state) {
  return state.flat().join("");
}

function copyState(state) {
  return state.map(row => [...row]);
}

function isGoal(state) {
  return stateToString(state) === stateToString(goalPuzzle);
}

function getNeighbors(state) {
  const neighbors = [];
  let zeroRow, zeroCol;

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (state[r][c] === 0) {
        zeroRow = r;
        zeroCol = c;
      }
    }
  }

  const moves = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  for (const [dr, dc] of moves) {
    const newRow = zeroRow + dr;
    const newCol = zeroCol + dc;

    if (newRow >= 0 && newRow < 3 && newCol >= 0 && newCol < 3) {
      const newState = copyState(state);
      newState[zeroRow][zeroCol] = newState[newRow][newCol];
      newState[newRow][newCol] = 0;
      neighbors.push(newState);
    }
  }

  return neighbors;
}

function bfs(start) {
  const queue = [{ state: start, path: [start] }];
  const visited = new Set();
  let nodes = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    const key = stateToString(current.state);

    if (visited.has(key)) continue;
    visited.add(key);
    nodes++;

    if (isGoal(current.state)) {
      return { path: current.path, nodes };
    }

    for (const neighbor of getNeighbors(current.state)) {
      queue.push({
        state: neighbor,
        path: [...current.path, neighbor]
      });
    }
  }
}

function dijkstra(start) {
  const queue = [{ state: start, path: [start], cost: 0 }];
  const visited = new Set();
  let nodes = 0;

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    const key = stateToString(current.state);

    if (visited.has(key)) continue;
    visited.add(key);
    nodes++;

    if (isGoal(current.state)) {
      return { path: current.path, nodes };
    }

    for (const neighbor of getNeighbors(current.state)) {
      queue.push({
        state: neighbor,
        path: [...current.path, neighbor],
        cost: current.cost + 1
      });
    }
  }
}

function manhattanDistance(state) {
  let distance = 0;

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const value = state[r][c];
      if (value !== 0) {
        const goalRow = Math.floor((value - 1) / 3);
        const goalCol = (value - 1) % 3;
        distance += Math.abs(r - goalRow) + Math.abs(c - goalCol);
      }
    }
  }

  return distance;
}

function astar(start) {
  const queue = [{
    state: start,
    path: [start],
    cost: 0,
    priority: manhattanDistance(start)
  }];

  const visited = new Set();
  let nodes = 0;

  while (queue.length > 0) {
    queue.sort((a, b) => a.priority - b.priority);
    const current = queue.shift();
    const key = stateToString(current.state);

    if (visited.has(key)) continue;
    visited.add(key);
    nodes++;

    if (isGoal(current.state)) {
      return { path: current.path, nodes };
    }

    for (const neighbor of getNeighbors(current.state)) {
      const newCost = current.cost + 1;
      queue.push({
        state: neighbor,
        path: [...current.path, neighbor],
        cost: newCost,
        priority: newCost + manhattanDistance(neighbor)
      });
    }
  }
}

function renderTicTacToe() {
  const board = document.getElementById("tttBoard");
  board.innerHTML = "";

  tttBoard.forEach((value, index) => {
    const cell = document.createElement("div");
    cell.className = value ? "cell " + value.toLowerCase() : "cell";
    cell.textContent = value;
    cell.onclick = () => humanMove(index);
    board.appendChild(cell);
  });
}

function humanMove(index) {
  // Block clicks if game over or cell occupied
  if (tttBoard[index] !== "" || checkWinner(tttBoard) !== null) return;

  const mode = getGameMode();

  // If Human vs AI, ensure it's the human's turn
  if (mode === 'human-ai') {
    const humanSymbol = humanIsSymbol();
    const next = nextPlayerSymbol();
    if (humanSymbol !== next) return; // not human's turn
  }

  const symbol = nextPlayerSymbol();
  tttBoard[index] = symbol;
  renderTicTacToe();

  let winner = checkWinner(tttBoard);

  if (winner === symbol) {
    updateTicTacToeStatus((mode === 'human-human') ? (symbol + " wins!") : "You win!");
    return;
  }

  if (winner === "draw") {
    updateTicTacToeStatus("Game ended in a draw.");
    return;
  }

  // Continue depending on mode
  if (mode === 'human-human') {
    updateTicTacToeStatus("Next: " + nextPlayerSymbol());
    return;
  }

  if (mode === 'human-ai') {
    updateTicTacToeStatus("AI's turn.");
    setTimeout(() => {
      const selectedAlgorithm = document.getElementById('humanAiAlgorithm')?.value || "alphabeta";
      aiMove(selectedAlgorithm);
    }, 500);
    return;
  }
  
  // For ai-ai mode, ignore human clicks (shouldn't happen because AI drives moves)
}

function resetTicTacToe() {
  tttBoard = ["", "", "", "", "", "", "", "", ""];
  renderTicTacToe();
  const mode = getGameMode();

  if (mode === 'ai-ai') {
    // Prepare board for AI vs AI but do not start here to avoid recursion.
    // Use the "AI vs AI Auto-play" button or switching game mode to start autoplay.
    updateTicTacToeStatus("AI vs AI ready. Click 'AI vs AI Auto-play' to start.");
    // ensure any previous AI interval is cleared
    aiRunning = false;
    aiPaused = false;
    if (aiIntervalId) { clearInterval(aiIntervalId); aiIntervalId = null; }
    return;
  }

  if (mode === 'human-human') {
    updateTicTacToeStatus("X's turn. Human vs Human.");
    return;
  }

  // mode === 'human-ai'
  const first = document.getElementById('firstPlayer')?.value || 'human';
  if (first === 'human') {
    updateTicTacToeStatus("Your turn. You are X.");
  } else {
    updateTicTacToeStatus("AI starts. You are O.");
    setTimeout(() => {
      const selectedAlgorithm = document.getElementById('humanAiAlgorithm')?.value || 'alphabeta';
      aiMove(selectedAlgorithm);
    }, 200);
  }
}

function updateTicTacToeStatus(message) {
  document.getElementById("tttStatus").textContent = message;
}

function checkWinner(board) {
  const wins = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
  ];

  for (const [a, b, c] of wins) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  if (!board.includes("")) return "draw";

  return null;
}

function minimax(board, isMaximizing) {
  const winner = checkWinner(board);

  if (winner === "X") return { score: 10, nodes: 1 };
  if (winner === "O") return { score: -10, nodes: 1 };
  if (winner === "draw") return { score: 0, nodes: 1 };

  let nodes = 1;

  if (isMaximizing) {
    let bestScore = -Infinity;

    for (let i = 0; i < 9; i++) {
      if (board[i] === "") {
        board[i] = "X";
        const result = minimax(board, false);
        board[i] = "";
        nodes += result.nodes;
        bestScore = Math.max(bestScore, result.score);
      }
    }

    return { score: bestScore, nodes };
  } else {
    let bestScore = Infinity;

    for (let i = 0; i < 9; i++) {
      if (board[i] === "") {
        board[i] = "O";
        const result = minimax(board, true);
        board[i] = "";
        nodes += result.nodes;
        bestScore = Math.min(bestScore, result.score);
      }
    }

    return { score: bestScore, nodes };
  }
}

function alphabeta(board, isMaximizing, alpha, beta) {
  const winner = checkWinner(board);

  if (winner === "X") return { score: 10, nodes: 1, pruned: 0 };
  if (winner === "O") return { score: -10, nodes: 1, pruned: 0 };
  if (winner === "draw") return { score: 0, nodes: 1, pruned: 0 };

  let nodes = 1;
  let pruned = 0;

  if (isMaximizing) {
    let bestScore = -Infinity;

    for (let i = 0; i < 9; i++) {
      if (board[i] === "") {
        board[i] = "X";
        const result = alphabeta(board, false, alpha, beta);
        board[i] = "";

        nodes += result.nodes;
        pruned += result.pruned;

        bestScore = Math.max(bestScore, result.score);
        alpha = Math.max(alpha, bestScore);

        if (beta <= alpha) {
          pruned++;
          break;
        }
      }
    }

    return { score: bestScore, nodes, pruned };
  } else {
    let bestScore = Infinity;

    for (let i = 0; i < 9; i++) {
      if (board[i] === "") {
        board[i] = "O";
        const result = alphabeta(board, true, alpha, beta);
        board[i] = "";

        nodes += result.nodes;
        pruned += result.pruned;

        bestScore = Math.min(bestScore, result.score);
        beta = Math.min(beta, bestScore);

        if (beta <= alpha) {
          pruned++;
          break;
        }
      }
    }

    return { score: bestScore, nodes, pruned };
  }
}

function aiMove(type) {
  const startTime = performance.now();

  // Determine which symbol should play now (X goes first)
  const symbol = nextPlayerSymbol();
  const stats = aiMoveForPlayer(symbol, type) || { nodes: 0, pruned: 0 };

  const endTime = performance.now();
  renderTicTacToe();

  const winner = checkWinner(tttBoard);

  if (winner === symbol) {
    updateTicTacToeStatus("AI wins.");
  } else if (winner === "draw") {
    updateTicTacToeStatus("Game ended in a draw.");
  } else {
    updateTicTacToeStatus("Your turn.");
  }

  let pruningRate = "N/A";

  if (type === "alphabeta") {
    pruningRate = stats.nodes + stats.pruned > 0 ? Math.round((stats.pruned / (stats.nodes + stats.pruned)) * 100) + "%" : "N/A";
  }

  updateDashboard(
    type.toUpperCase(),
    Math.round(endTime - startTime),
    stats.nodes,
    0,
    pruningRate
  );

  // In Module B (tic-tac-toe) we don't show solution length
  setSolutionLengthVisibility(false);
  // Show pruning only if this move used alpha-beta
  setPruningRateVisibility(type === 'alphabeta');
}

renderPuzzle();
renderTicTacToe();
// Initial dashboard visibility: show solution length for puzzle, hide pruning rate
setSolutionLengthVisibility(true);
setPruningRateVisibility(false);

// Theme (dark mode) support
function applyTheme(theme) {
  if (theme === 'dark') document.body.classList.add('dark');
  else document.body.classList.remove('dark');
  const checkbox = document.getElementById('themeToggle'); if (checkbox) checkbox.checked = (theme === 'dark');
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  const checkbox = document.getElementById('themeToggle'); if (checkbox) checkbox.checked = isDark;
}

// Load saved theme on startup
const savedTheme = localStorage.getItem('theme') || 'light';
applyTheme(savedTheme);

document.getElementById('themeToggle')?.addEventListener('change', (e) => {
  toggleTheme();
});

document
  .getElementById("imageUpload")
  .addEventListener("change", loadImage);

// Update pruning visibility when user changes selected AI algorithms
document.getElementById('xAlgorithm')?.addEventListener('change', () => {
  const xAlg = document.getElementById('xAlgorithm').value;
  const oAlg = document.getElementById('oAlgorithm')?.value;
  setPruningRateVisibility(xAlg === 'alphabeta' || oAlg === 'alphabeta');
});

document.getElementById('oAlgorithm')?.addEventListener('change', () => {
  const xAlg = document.getElementById('xAlgorithm')?.value;
  const oAlg = document.getElementById('oAlgorithm').value;
  setPruningRateVisibility(xAlg === 'alphabeta' || oAlg === 'alphabeta');
});

// Initialize pause button text and speed display
const pauseBtn = document.getElementById('aiPauseBtn'); if (pauseBtn) pauseBtn.textContent = 'Pause';
const speedDisplay = document.getElementById('aiSpeedValue'); if (speedDisplay) speedDisplay.textContent = aiIntervalDelay + 'ms';

// If user changes who goes first to AI, reset and let AI start immediately
document.getElementById('firstPlayer')?.addEventListener('change', (e) => {
  const val = e.target.value;
  if (val === 'ai') {
    // Reset will trigger AI to make the opening move (resetTicTacToe handles AI-first)
    resetTicTacToe();
  } else {
    // If switching back to human, just reset to let human play first
    resetTicTacToe();
  }
});

// When game mode changes, reset board and start/stop AI autoplay as needed
document.getElementById('gameMode')?.addEventListener('change', (e) => {
  const val = e.target.value;
  if (val === 'ai-ai') {
    // start AI vs AI
    startAIVsAI();
  } else {
    // stop any running AI autoplay
    stopAIVsAI();
    resetTicTacToe();
  }
});



function loadImage(event) {
  const file = event.target.files[0];

  if (!file) return;

  const reader = new FileReader();

  reader.onload = function(e) {
    const sourceImage = new Image();

    sourceImage.onload = function() {
      const cropSize = Math.min(sourceImage.width, sourceImage.height);
      const sx = (sourceImage.width - cropSize) / 2;
      const sy = (sourceImage.height - cropSize) / 2;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      canvas.width = 270;
      canvas.height = 270;
      context.drawImage(sourceImage, sx, sy, cropSize, cropSize, 0, 0, 270, 270);

      uploadedImage = new Image();
      uploadedImage.onload = function() {
        puzzleMoves = 0;
        renderPuzzle();
        updatePuzzleStatus("Image loaded. Moves: 0");
      };
      uploadedImage.src = canvas.toDataURL("image/png");
    };

    sourceImage.onerror = function() {
      alert("The image could not be loaded. Please choose a JPG or PNG file.");
    };

    sourceImage.src = e.target.result;
  };

  reader.readAsDataURL(file);
}

function startAIVsAI() {
  resetTicTacToe();
  updateTicTacToeStatus("AI vs AI started.");
  aiRunning = true;
  aiPaused = false;
  aiCurrentPlayer = "X";
  startAIInterval();
}

function aiMoveForPlayer(player, type) {
  let bestScore = player === "X" ? -Infinity : Infinity;
  let bestMove = null;
  let totalNodes = 0;
  let baselineNodes = 0;

  for (let i = 0; i < 9; i++) {
    if (tttBoard[i] === "") {
      tttBoard[i] = player;

      if (type === "alphabeta") {
        baselineNodes += minimax(tttBoard, player === "O").nodes;
      }

      const result = type === "alphabeta"
        ? alphabeta(tttBoard, player === "O", -Infinity, Infinity)
        : minimax(tttBoard, player === "O");

      tttBoard[i] = "";
      totalNodes += result.nodes;

      if (player === "X") {
        if (result.score > bestScore) {
          bestScore = result.score;
          bestMove = i;
        }
      } else {
        if (result.score < bestScore) {
          bestScore = result.score;
          bestMove = i;
        }
      }
    }
  }

  if (bestMove !== null) {
    tttBoard[bestMove] = player;
  }

  const savedNodes = type === "alphabeta" ? Math.max(0, baselineNodes - totalNodes) : 0;
  return { nodes: totalNodes, pruned: savedNodes, baselineNodes };
}
