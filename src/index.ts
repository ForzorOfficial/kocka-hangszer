
import './style.css'

import $ from 'jquery';
import { TwistyPlayer } from 'cubing/twisty';
import * as THREE from 'three';

import {
  connectGanCube,
  GanCubeConnection,
  GanCubeEvent,
  GanCubeMove,
  MacAddressProvider,
  cubeTimestampCalcSkew,
} from 'gan-web-bluetooth';


var twistyPlayer = new TwistyPlayer({
  puzzle: '3x3x3',
  visualization: 'PG3D',
  alg: '',
  experimentalSetupAnchor: 'start',
  background: 'none',
  controlPanel: 'none',
  hintFacelets: 'none',
  experimentalDragInput: 'none',
  cameraLatitude: 0,
  cameraLongitude: 0,
  cameraLatitudeLimit: 0,
  tempoScale: 5
});

$('#cube').append(twistyPlayer);

var conn: GanCubeConnection | null;
var lastMoves: GanCubeMove[] = [];

var twistyScene: THREE.Scene;
var twistyVantage: any;

let lastMove: string | null = null;
let moveTimeout: number | null = null;

var cubeQuaternion: THREE.Quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(30 * Math.PI / 180, -30 * Math.PI / 180, 0));

async function amimateCubeOrientation() {
  if (!twistyScene || !twistyVantage) {
    var vantageList = await twistyPlayer.experimentalCurrentVantages();
    twistyVantage = [...vantageList][0];
    twistyScene = await twistyVantage.scene.scene();
  }
  twistyScene.quaternion.slerp(cubeQuaternion, 0.25);
  twistyVantage.render();
  requestAnimationFrame(amimateCubeOrientation);
}
requestAnimationFrame(amimateCubeOrientation);

function playMoveSound(move: string ) {
  let soundFile = '';

  switch (move) {
      case 'R':
          soundFile = '/kocka-hangszer/sounds/c3.mp3';
          break;
      case 'L':
          soundFile = '/kocka-hangszer/sounds/d3.mp3';
          break;
      case 'U':
          soundFile = '/kocka-hangszer/sounds/e3.mp3';
          break;
      case 'D':
          soundFile = '/kocka-hangszer/sounds/f3.mp3';
          break;
      case 'F':
          soundFile = '/kocka-hangszer/sounds/g3.mp3';
          break;
      case 'B':
          soundFile = '/kocka-hangszer/sounds/a4.mp3';
          break;
      case "M":
          soundFile = '/kocka-hangszer/sounds/b3.mp3';
          break;
      case "R'":
          soundFile = '/kocka-hangszer/sounds/c4.mp3';
          break;
      case "L'":
          soundFile = '/kocka-hangszer/sounds/d4.mp3';
          break;
      case "U'":
          soundFile = '/kocka-hangszer/sounds/e4.mp3';
          break;
      case "D'":
          soundFile = '/kocka-hangszer/sounds/f4.mp3';
          break;
      case "F'":
          soundFile = '/kocka-hangszer/sounds/g4.mp3';
          break;
      case "B'":
          soundFile = '/kocka-hangszer/sounds/a5.mp3';
          break;
      case "M'":
          soundFile = '/kocka-hangszer/sounds/b4.mp3';
          break;
      default:
          return;
  }
  const sound = new Audio(soundFile);
  sound.play().catch(error => console.error('Error playing audio:', error));
}

async function handleMoveEvent(event: GanCubeEvent) {
  if (event.type == "MOVE") {
    if (moveTimeout) {
      clearTimeout(moveTimeout);
      moveTimeout = null;
  }
  
 if (lastMove === "L" && event.move === "R'") {
        console.log("Detected L -> R' sequence, playing M'");
        playMoveSound("M'");
        lastMove = null;
    }
    else if (lastMove === "R" && event.move === "L'") {
      console.log("Detected R -> L' sequence, playing M");
      playMoveSound("M");
      lastMove = null;
    }
    else {
        lastMove = event.move;
        moveTimeout = setTimeout(() => {
            playMoveSound(event.move);
            lastMove = null;
        }, 90);
    }
  
    twistyPlayer.experimentalAddMove(event.move, { cancel: false });
    lastMoves.push(event);

    if (lastMoves.length > 256) {
      lastMoves = lastMoves.slice(-256);
    }
    if (lastMoves.length > 10) {
      var skew = cubeTimestampCalcSkew(lastMoves);
      $('#skew').val(skew + '%');
    }
  }
}

function handleCubeEvent(event: GanCubeEvent) {
  if (event.type != "GYRO")
   if (event.type == "MOVE") {
    handleMoveEvent(event);
  } else if (event.type == "HARDWARE") {
    $('#hardwareName').val(event.hardwareName || '- n/a -');
  } else if (event.type == "BATTERY") {
    $('#batteryLevel').val(event.batteryLevel + '%');
  } else if (event.type == "DISCONNECT") {
    twistyPlayer.alg = '';
    $('.info input').val('- n/a -');
    $('#connect').html('Csatlakozás');
  }
}

const customMacAddressProvider: MacAddressProvider = async (device, isFallbackCall): Promise<string | null> => {
  if (isFallbackCall) {
    return prompt('A kocka MAC címének felfedése sikertelen volt!\nKérlek add meg a kocka MAC címet manuálisan:');
  } else {
    return typeof device.watchAdvertisements == 'function' ? null :
      prompt('Seems like your browser does not support Web Bluetooth watchAdvertisements() API. Enable following flag in Chrome:\n\nchrome://flags/#enable-experimental-web-platform-features\n\nor enter cube MAC address manually:');
  }
};

$('#reset-state').on('click', async () => {
  await conn?.sendCubeCommand({ type: "REQUEST_RESET" });
  twistyPlayer.alg = '';
});

$('#connect').on('click', async () => {
  if (conn) {
    conn.disconnect();
    conn = null;
    $('#connect').html('Csatlakozás');
  } else {
    try {
      conn = await connectGanCube(customMacAddressProvider);
      conn.events$.subscribe(handleCubeEvent);
      await conn.sendCubeCommand({ type: "REQUEST_HARDWARE" });
      await conn.sendCubeCommand({ type: "REQUEST_FACELETS" });
      await conn.sendCubeCommand({ type: "REQUEST_BATTERY" });
      $('#deviceName').val(conn.deviceName);
      $('#deviceMAC').val(conn.deviceMAC);
      $('#connect').html('Lecsatlakozás');
    } catch (error) {
      console.error("Connection attempt failed", error);
      alert("Sikertelen csatlakozás! Próbáld újra.");
    }
  }
});
