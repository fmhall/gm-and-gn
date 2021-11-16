const token =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1NzQ5MjAyNC1mMWI4LTQxNzAtOWU0NS1jNTRkMTYzY2UxMTQiLCJpZCI6MTYyMywiaWF0IjoxNjAxOTQ1ODI1fQ.G7yJAlV0Yc5j7v_NBJ4gPiXzoEsU5lfN3RmX6g0d6xI";
const morning = "#d54200";
const night = "#539AF9";

const counters = document.getElementsByClassName("counter");
const duration = document.getElementById("duration");
const logToggle = document.getElementById("logToggle");
const log = document.getElementById("log");

let timeOpened = performance.now();
let instancesByType = [0, 0]; // morning, night

let theme = 0;

// TWEETS

(function runMap() {
  Cesium.Ion.defaultAccessToken = token;
  //console.log("Hello?");
  const viewer = new Cesium.Viewer("cesiumContainer", {
    geocoder: false,
    sceneModePicker: false,
    baseLayerPicker: false,
    navigationHelpButton: false,
    imageryProvider: new Cesium.IonImageryProvider({ assetId: 3812 })
  });

  const scene = viewer.scene;

  let doIcrf = false;
  function icrf(scene, time) {
    if (!doIcrf) return;

    const icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(time);
    if (Cesium.defined(icrfToFixed)) {
      const camera = viewer.camera;
      const offset = Cesium.Cartesian3.clone(camera.position);
      const transform = Cesium.Matrix4.fromRotationTranslation(icrfToFixed);
      camera.lookAtTransform(transform, offset);
    }
  }
  scene.postUpdate.addEventListener(icrf);
  scene.globe.enableLighting = true;

  const imageryLayers = viewer.imageryLayers;
  const nightLayer = imageryLayers.get(0);
  const dayLayer = imageryLayers.addImageryProvider(
    new Cesium.IonImageryProvider({
      assetId: 3845
    })
  );
  imageryLayers.lowerToBottom(dayLayer);

  dayLayer.show = true;
  viewer.scene.globe.enableLighting = true;
  viewer.clock.shouldAnimate = true;

  nightLayer.dayAlpha = true ? 0.0 : 1.0;

  document.addEventListener("keydown", function(e) {
    if (e.key === "g") {
      doIcrf = !doIcrf;
    }
    
    if (!doIcrf) {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }
  });
  window.viewer = viewer;
  // To avoid bug on Android phones
  // https://github.com/CesiumGS/cesium/issues/7871
  viewer.scene.globe.showGroundAtmosphere = false
  
  function isVisible(availability) {
    // Given an entity's availability
    // Return true if it is visible 
    // By checking if it's start >= currentTime
    const start = availability._intervals[0].start;
    const check = Cesium.JulianDate.greaterThanOrEquals(viewer.clock.currentTime, start);
    return check;
  }
  
  let labelEntity;
  function updateLabelFromPoint(pointEntity) {
    const tweetObj = pointEntity.tweetObj;
    const result = wordWarp(tweetObj.text, 30);
    const tweet = result.newText;
    const lines = result.lines;
    
    labelEntity.position = pointEntity.position.getValue(viewer.clock.currentTime).clone();
    labelEntity.label.pixelOffset = new Cesium.Cartesian2(0, -10 * lines - 10);
    labelEntity.label.text = tweet;
    labelEntity.description = pointEntity.description;
  }

  function wordWarp(text, charLimit) {
    let newText = "";
    let count = 0;
    let words = text.split(" ");
    let lines = 0;
    for (let i = 0; i < words.length; i++) {
      newText += words[i] + " ";
      if (count >= charLimit) {
        count = 0;
        lines++;
        newText += "\n ";
      }
      count += words[i].length;
    }
    return { newText, lines };
  }
  // Allow URLs in the infobox 
   viewer.infoBox.frame.sandbox = "allow-same-origin allow-top-navigation allow-pointer-lock allow-popups allow-forms allow-scripts";

  // Turn off auto-camera flights if the user interacts with the map
  const INTERACTION_MAX = 60 * 10;
  let interactionCounter = INTERACTION_MAX;
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction(function (e) {
    interactionCounter = 0;
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
  
  
  var lastTime = viewer.clock.currentTime.clone();
  let lastPoint;
  // Turn it back on if not interacted for more than 30 seconds
  viewer.clock.onTick.addEventListener(function (clock) {
    interactionCounter++;
    
    if (Math.abs(Cesium.JulianDate.secondsDifference(viewer.clock.currentTime, lastTime)) > 1) {
      lastTime = viewer.clock.currentTime.clone();
      // Find the last visible point
      const entities = viewer.entities.values;
      let foundEntity = false;
      for (let i = entities.length - 1; i >= 0; i--) {
        // Go backwards, assuming the viewer will mostly be at the very end, to early exit most of the time
        let entity = entities[i];
        if (entity.isTweetPoint && isVisible(entity.availability)) {
          updateLabelFromPoint(entity);
          window.latestFoundEntity = entity;
          foundEntity = true;
          break;
        }
      }
      labelEntity.show = foundEntity;
    }
  });

  labelEntity = viewer.entities.add({
    label: {
      text: "",
      font: "22px Helvetica",
      // pixelOffset: new Cesium.Cartesian2(0, -10 * lines - 10),
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      scaleByDistance: new Cesium.NearFarScalar(4e6, 1, 1e7, 0.5)
    }
  });
  window.labelEntity = labelEntity;
  
  function addTweet(tweetObj, lon, lat, color) {
    const result = wordWarp(tweetObj.text, 30);
    const tweet = result.newText;
    const lines = result.lines;

    const now = Cesium.JulianDate.now();
    const later = Cesium.JulianDate.addSeconds(
      now,
      60 * 60 * 60,
      new Cesium.JulianDate()
    );

    const littleLater = Cesium.JulianDate.addSeconds(
      now,
      60,
      new Cesium.JulianDate()
    );
    

    if (lastPoint) {
      // Make the last point disappear when a new point appears.
      // lastPoint.availability.get(0).stop = now.clone();
    }

    const newPoint = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      name: tweetObj.place,
      description: `<p>${tweetObj.text}</p><p>${tweetObj.url}</p><br><br>`,
      availability: new Cesium.TimeIntervalCollection([
        new Cesium.TimeInterval({
          start: now.clone(),
          stop: later.clone()
        })
      ]),
      point: {
        pixelSize: 5,
        color: Cesium.Color.fromCssColorString(color)
      }
    });
    
    newPoint.tweetObj = tweetObj;
    newPoint.isTweetPoint = true;
    
    // updateLabelFromPoint(newPoint)

    lastPoint = newPoint;
    
    // Only move the camera if the clock is playing
    // that way the user can scrub back in time and won't be interrupted.
    if (interactionCounter > INTERACTION_MAX && doIcrf != true) {
      viewer.timeline.zoomTo(viewer.clock.startTime, littleLater);
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, viewer.camera.positionCartographic.height),
        easingFunction: Cesium.EasingFunction.QUADRACTIC_IN_OUT,
        duration: 4
      });
    }
  }
  // Initialize timeline at now + 60 seconds
  const now = Cesium.JulianDate.now();
  const later = Cesium.JulianDate.addSeconds(now, 60, new Cesium.JulianDate());

  viewer.timeline.zoomTo(now, later);

  var socket = io();
  socket.on("tweet", function(tweet) {
    incrementInstances(tweet.eventType);
    // console.log(tweet);
    // console.log(tweet.text);
    // console.log(tweet.latlng);
    // console.log(tweet.eventType);

    var eventcolor = tweet.eventType == 0 ? morning : night; // colors
    let popupOptions = {
      maxWidth: 200,
      // maxHeight: 36,
      closeButton: false,
      autoClose: true,
      closeOnEscapeKey: false,
      closeOnClick: true,
      className: "popup"
    };
    
    addTweet(tweet, tweet.latlng['lng'], tweet.latlng['lat'], eventcolor);

    let logEntry = document.createElement("a");
    logEntry.href = tweet.url;
    logEntry.classList.add("logEntry");
    logEntry.classList.add(tweet.eventType == 0 ? "morning" : "night");
    let entryLoc = document.createElement("span");
    entryLoc.classList.add("entryLoc");
    if (tweet.hasOwnProperty("place")) {
      entryLoc.classList.add("place");
      entryLoc.textContent = tweet.place;
    } else {
      entryLoc.classList.add("coords");
      entryLoc.textContent =
        tweet.latlng["lat"].toFixed(2) + "," + tweet.latlng["lng"].toFixed(2);
    }
    logEntry.append(entryLoc);
    let entryText = tweet.text;
    logEntry.append(entryText);
    log.prepend(logEntry);
    // log.scrollBottom = log.scrollHeight;
    log.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth"
    });
  });
})();

function incrementInstances(eventType) {
  instancesByType[eventType]++;
  let instances = instancesByType[eventType];
  let pluralStr = getAgreedPluralStr(instances, "time", "times");
  counters[eventType].textContent = instances + " " + pluralStr;
}

function getAgreedPluralStr(num, singularStr, pluralStr) {
  if (num == 1) {
    return singularStr;
  }
  return pluralStr;
}
