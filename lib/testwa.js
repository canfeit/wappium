#!/usr/bin/env node
// transpile:testwa
const _ = require("lodash");
const path = require("path");
const { fs, mkdirp, util, logger } = require("appium-support");
const { retry } = require("asyncbox");
const battery = require("./battery");

let log = logger.getLogger("Testwa");
let logData = logger.getLogger("TestWaData");

let temp = require("temp"),
  testwaresponse = require("./middleware.js"),
  testData = require("./testcasedata.js"),
  async = require("async"),
  stringify = require("json-stringify-safe"),
  querystring = require("querystring"),
  endOfLine = require("os").EOL,
  fse = require("fs-extra"),
  fileSystem = require("fs"),
  execSync = require("child_process").execSync,
  spawnSync = require("child_process").spawnSync,
  exec = require("child_process").exec,
  spawn = require("child_process").spawn;

let testwa = {};
Object.assign(testwa, battery);
let testSuit = "";
let testcaseId = "";
let executionTaskId = "";
let deviceid = "";
let reportPath = "";
let reportRelativePath = "../../../../../../report";
let reportListName = "reportList";
let reportFileName = "Test";
let reportFile = "Test0";

function lineCount(file) {
  let data = fileSystem.readFileSync(file);
  return data.toString().split(endOfLine).length - 1;
}

function getReportFileName(reportPath, reportListName) {
  return fileSystem.existsSync(
    reportPath + "/resources/" + reportListName + ".json"
  )
    ? reportFileName +
        lineCount(reportPath + "/resources/" + reportListName + ".json")
    : reportFileName + 0;
}

function initReportPath(driver) {
  reportPath = driver.args.reportPath
    ? driver.args.reportPath
    : path.resolve(__dirname, reportRelativePath);
}
testwa.initBaseDriver = function(driver) {
  //driver = android driver or ios
  initReportPath(driver);

  let Driver = driver.sessions[Object.keys(driver.sessions)[0]];
  let caps = Driver.caps;

  let reportEntity = driver.reportEntity;
  let reportList = reportEntity.reportList;
  let reportSummary = reportEntity.reportSummary;

  //handle date
  let date = new Date();
  let startTime = date.getTime();
  reportEntity.sessionStartTime = startTime;
  date = new Date(startTime);
  let startTimeStr = date
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/, "");
  reportList.sessionStartTime = startTimeStr;
  reportList.deviceName = caps.deviceName;
  reportList.apkName = caps.appPackage;
  reportSummary.deviceName = caps.deviceName;
  reportSummary.apkName = caps.appPackage;
  reportSummary.result = 0;

  reportFile = getReportFileName(reportPath, reportListName);
  reportList.fileName = reportFile;
  let listTemplatePath = path.resolve(__dirname, "listTemplate");
  //copy listTemplate if not exist
  if (!fileSystem.existsSync(reportPath + "/index.html")) {
    // let listTemplatePath = path.resolve(__dirname, 'listTemplate');
    // ncp(listTemplatePath, reportPath, function (err) {
    //     if (err) {return log.error(err);}
    // });
    try {
      fse.copySync(listTemplatePath, reportPath);
    } catch (err) {
      log.error(err);
    }
  }
  //copy template to reportpath
  let templatePath = path.resolve(__dirname, "template");
  // ncp(templatePath, reportPath+'/'+reportFile, function (err) {
  //     if (err) {return log.error(err);}
  //     //init reportSteps.js
  //     fileSystem.writeFileSync(reportPath+'/'+reportFile+'/resources/reportSteps.js','var reportSteps = [ ');
  // });
  try {
    fse.copySync(templatePath, reportPath + "/" + reportFile);
    fileSystem.writeFileSync(
      reportPath + "/" + reportFile + "/resources/reportSteps.js",
      "var reportSteps = [ "
    );
  } catch (err) {
    log.error(err);
  }
};

testwa.responseNoDriver = function(
  driver,
  req,
  httpStatus,
  httpResBody,
  commond,
  jsonObj
) {
  let args = driver.args;

  let testDataReply = _.cloneDeep(testData);
  testDataReply.testdata.description =
    "No Driver found for this session, probably appium error, please restart appium!";
  if (args.genTool) {
    logData.error(stringify(testDataReply));
  } else {
    testwaresponse.SendDataNativeApp(testDataReply.testdata, args.portal);
  }
};

function generateReportFinish(driver) {
  let reportEntity = driver.reportEntity;
  let reportList = reportEntity.reportList;
  let reportSummary = reportEntity.reportSummary;
  let date = new Date();
  let endTime = date.getTime();
  reportEntity.sessionEndTime = endTime;
  reportSummary.sessionTotalTime =
    reportEntity.sessionEndTime - reportEntity.sessionStartTime;

  //reportSteps.js
  fileSystem.appendFileSync(
    reportPath + "/" + reportFile + "/resources/reportSteps.js",
    "];"
  );

  //reportSummary.js
  let summaryJs = "var reportSummary = " + stringify(reportSummary) + " ;";
  fileSystem.writeFileSync(
    reportPath + "/" + reportFile + "/resources/reportSummary.js",
    summaryJs
  );
  fileSystem.writeFileSync(
    reportPath + "/" + reportFile + "/resources/reportSummary.json",
    stringify(reportSummary)
  );

  //write reportList.json
  reportList.result = reportSummary.result;
  reportList.sessionTotalTime = reportSummary.sessionTotalTime;
  fileSystem.appendFileSync(
    reportPath + "/resources/" + reportListName + ".json",
    JSON.stringify(reportList) + endOfLine
  );
  //write reportList.js
  let reportListJs = "";
  reportListJs = fileSystem.readFileSync(
    reportPath + "/resources/" + reportListName + ".js",
    "utf8"
  );
  reportListJs = reportListJs.replace(
    "var reportLists = [" + endOfLine,
    "var reportLists = [" +
      endOfLine +
      JSON.stringify(reportList) +
      "," +
      endOfLine
  );
  fileSystem.writeFileSync(
    reportPath + "/resources/" + reportListName + ".js",
    reportListJs
  );
}

testwa.responseDeleteSession = async function(
  driver,
  req,
  httpStatus,
  httpResBody,
  commond,
  jsonObj
) {
  let testDataReply = _.cloneDeep(testData);
  testDataReply.testdata.status = 0;
  testDataReply.testdata.value = httpResBody.value;
  testDataReply.testdata.runtime = 0;
  testDataReply.testdata.sessionId = httpResBody.sessionId;
  testDataReply.testdata.deviceId = deviceid;
  testDataReply.testdata.testSuit = testSuit;
  testDataReply.testdata.testcaseId = testcaseId;
  testDataReply.testdata.executionTaskId = executionTaskId;
  testDataReply.testdata.command = { action: "停止测试", params: "" };
  testDataReply.testdata.screenshotPath = "";

  if (driver.battery) {
    [
      testDataReply.testdata.battery,
      testDataReply.testdata.network
    ] = testwa.getBatteryStatsDeleteSession(driver);
    //reset battery info
    driver.battery = null;
  }

  let myDate = new Date();
  let endTime = myDate.getTime();
  testDataReply.testdata.runtime = endTime - req._startTime.getTime();
  testDataReply.testdata.status = httpResBody.status;
  if (null !== httpResBody.value) {
    testDataReply.description = httpResBody.value.message
      ? httpResBody.value.message
      : "";
  }

  let args = driver.args;
  let genTool = args.genTool;
  let portal = args.portal;
  let report = args.report;

  if (genTool) {
    // log.debug(testDataReply);
    logData.error(stringify(testDataReply));
    if (report) {
      generateReportSteps(testDataReply, "");
      generateReportFinish(driver);
    }
  } else if (portal) {
    testwaresponse.SendDataNativeApp(testDataReply.testdata, portal);
    if (report) {
      generateReportSteps(testDataReply, "");
      generateReportFinish(driver);
    }
  }
};
testwa.responseIOSCompatibilityTest = function(
  driver,
  req,
  httpStatus,
  httpResBody,
  command,
  jsonObj
) {
  let osDriver = driver.sessions[httpResBody.sessionId];

  let testDataReply = _.clone(testData);
  testDataReply.testdata.status = httpResBody.status;
  testDataReply.testdata.value = httpResBody.value;
  testDataReply.testdata.runtime = 0;
  testDataReply.testdata.sessionId = httpResBody.sessionId;
  testDataReply.testdata.deviceId = deviceid;
  testDataReply.testdata.testSuit = testSuit;
  testDataReply.testdata.testcaseId = testcaseId;
  testDataReply.testdata.executionTaskId = executionTaskId;
  testDataReply.testdata.command = {
    action: "安装应用",
    params: `安装本地应用 ：${osDriver.caps.app}`
  };
  testDataReply.testdata.screenshotPath = "";
  // install app time
  testDataReply.testdata.runtime = osDriver.installAppTime;
  testwaresponse.SendDataNativeApp(testDataReply.testdata, driver.args.portal);
  // start app time
  testDataReply.testdata.command = {
    action: "启动应用",
    params: `启动应用 ：${osDriver.caps.bundleId}`
  };
  testDataReply.testdata.runtime = osDriver.startAppTime;
  testwaresponse.SendDataNativeApp(testDataReply.testdata, driver.args.portal);
};

testwa.handler = async function(
  driver,
  req,
  httpStatus,
  httpResBody,
  command,
  jsonObj
) {
  let osDriver = driver.sessions[httpResBody.sessionId];
  if (osDriver && command) {
    if (command !== "createSession") {
      let platformName = osDriver.caps.platformName.toLowerCase();
      if ("android" === platformName) {
        //Android device
        log.debug("Testwa android device handler");
        await testwa.getActionAndroid(
          driver,
          req,
          httpStatus,
          httpResBody,
          command,
          jsonObj
        );
      } else if ("ios" === platformName) {
        //IOS device
        log.debug("Testwa ios device handler");
        await testwa.getActionIOS(
          driver,
          req,
          httpStatus,
          httpResBody,
          command,
          jsonObj
        );
      } else {
        log.debug("Testwa no supported device : " + platformName);
      }
    } else if (command === "createSession") {
      //createSession
      //mkdir -p for screenshot path
      await mkdirp(driver.args.screenshotPath);
      let platformName = osDriver.caps.platformName.toLowerCase();
      log.debug("Create Session!");
      if (
        "android" === platformName &&
        (osDriver.caps.batteryStats || driver.args.batteryStats) &&
        command === "createSession"
      ) {
        testwa.initBatteryStatsAndroid(driver, osDriver);
      } else if (osDriver.caps.compatibilityTest) {
        // ios xcuitest compatibility test get start app time and install app time here and report to server
        testwa.responseIOSCompatibilityTest(
          driver,
          req,
          httpStatus,
          httpResBody,
          command,
          jsonObj
        );
      }
    }
  } else if (command === "deleteSession") {
    //deleteSession
    log.debug("Delete Session!");
    await testwa.responseDeleteSession(
      driver,
      req,
      httpStatus,
      httpResBody,
      command,
      jsonObj
    );
  } else if (!command) {
    //No command here probably checking status, so skip
    log.debug("No command here so skip!");
  } else {
    //no driver found , response error
    log.debug("No Android/IOSDriver found here! Please restart Appium!");
    testwa.responseNoDriver(
      driver,
      req,
      httpStatus,
      httpResBody,
      command,
      jsonObj
    );
  }
};

//Android driver
testwa.getTranslationAction = function(commond, jsonObj) {
  if (commond === "createSession") {
    return ["创建会话", ""];
  } else if (commond === "findElements") {
    if ("byName" === jsonObj.mode) {
      return ["查找元素（by name）", jsonObj.value];
    }
    return ["查找元素（" + jsonObj.using + "）", jsonObj.value];
  } else if (commond === "findElement") {
    if ("check" === jsonObj.mode) {
      return [
        "检查元素（" + jsonObj.using + "）",
        jsonObj.value,
        jsonObj.mode,
        jsonObj.note
      ];
    } else if ("byName" === jsonObj.mode) {
      return ["查找元素（by name）", jsonObj.value];
    }
    return ["查找元素（" + jsonObj.using + "）", jsonObj.value];
  } else if (commond === "click") {
    return ["点击", ""];
  } else if (
    commond === "setValue" ||
    commond === "setValueImmediate" ||
    commond === "inputValue"
  ) {
    return ["输入", jsonObj.value];
  } else if (commond === "pressKeyCode") {
    return ["输入", `输入keycode: ${jsonObj.keycode}`];
  } else if (commond === "implicitWait") {
    return ["等待", jsonObj.ms + "ms"];
  } else if (commond === "getWindowSize") {
    return ["获取屏幕大小", ""];
  } else if (commond === "performTouch") {
    if (jsonObj.actions.length === 1) {
      let action = jsonObj.actions[0];
      if (action.action === "longPress") {
        let options = action.options;
        return [
          "长按",
          "(x:" + options.x + ",y:" + options.y + ")" + options.duration + " ms"
        ];
      } else if (action.action === "tap") {
        let options = action.options;
        return ["点击", "(x:" + options.x + ",y:" + options.y + ")"];
      }
    } else if (jsonObj.actions.length === 4) {
      let action1 = jsonObj.actions[0];
      let action3 = jsonObj.actions[2];
      if (action1.action === "press" && action3.action === "moveTo") {
        let options1 = action1.options;
        let options3 = action3.options;
        return [
          "滑屏",
          "从(x:" +
            options1.x +
            ",y:" +
            options1.y +
            ")到(x:" +
            options3.x +
            ",y:" +
            options3.y +
            ")"
        ];
      }
    }
  } else if (commond === "installApp") {
    return ["安装应用", `安装本地应用 ：${jsonObj.appPath}`];
  } else if (commond === "startActivity" || commond === "launchApp") {
    return ["启动应用", `启动应用 ： ${jsonObj.appPackage}`];
  } else if (commond === "removeApp") {
    return ["卸载应用", `卸载应用 ：${jsonObj.appId}`];
  }

  return [commond, jsonObj.value];
};
testwa.genRsp = function(
  driver,
  req,
  httpStatus,
  httpResBody,
  action,
  param,
  commandMode,
  commandNotes,
  cpuRate,
  memoryInfo
) {
  let Driver = driver.sessions[httpResBody.sessionId];
  let caps = Driver.caps;
  let args = driver.args;

  let testDataReply = _.cloneDeep(testData);
  testDataReply.testdata.status = httpStatus;
  testDataReply.testdata.value = httpResBody.value;
  testDataReply.testdata.runtime = 0;
  testDataReply.testdata.cpurate = cpuRate ? cpuRate : "0";
  testDataReply.testdata.memory = memoryInfo ? memoryInfo : "0";
  testDataReply.testdata.sessionId = httpResBody.sessionId;
  testDataReply.testdata.deviceId = deviceid = caps ? caps.deviceName : "";
  testDataReply.testdata.testSuit = testSuit = caps ? caps.testSuit : "";
  testDataReply.testdata.testcaseId = testcaseId = caps ? caps.testcaseId : "";
  testDataReply.testdata.executionTaskId = executionTaskId = caps
    ? caps.executionTaskId
    : "";
  testDataReply.testdata.command = { action: action, params: param };
  if (commandMode) {
    testDataReply.testdata.command.mode = commandMode;
  }
  if (commandNotes) {
    testDataReply.testdata.command.note = commandNotes;
  }

  let myDate = new Date();
  let endTime = myDate.getTime();
  if (action === "启动应用") {
    testDataReply.testdata.runtime = Driver.adb.appLaunchTotalTime;
  } else {
    testDataReply.testdata.runtime = endTime - req._startTime.getTime();
  }

  testDataReply.testdata.status = httpResBody.status;
  if (null !== httpResBody.value) {
    testDataReply.testdata.description = httpResBody.value.message
      ? httpResBody.value.message
      : "";
  }

  return [testDataReply, endTime];
};

//use another way getting logcat
testwa.outputLogcat = function(Driver) {
  let adb = Driver.adb;
  if (adb && querystring.stringify(adb.logcat) !== null) {
    console.log("[to-server-logcat-start]");
    console.log(adb.logcat.getLogs());
    console.log("[to-server-logcat-end]");
  }
};

function generateReportSteps(testDataReply, tempPng) {
  testDataReply.testdata.screenshotPath = tempPng;
  let jsonStr = stringify(testDataReply);
  fileSystem.appendFileSync(
    reportPath + "/" + reportFile + "/resources/reportSteps.json",
    jsonStr + endOfLine
  );
  fileSystem.appendFileSync(
    reportPath + "/" + reportFile + "/resources/reportSteps.js",
    jsonStr + "," + endOfLine
  );
}

function reportReply(report, testDataReply, tempPng) {
  if (report) {
    generateReportSteps(testDataReply, tempPng);
    testDataReply.testdata.status == 0
      ? null
      : (driver.reportEntity.reportSummary.result = 1);
  }
}
function replyAction(driver, args, testDataReply, tempPng) {
  let genTool = args.genTool;
  let portal = args.portal;
  let report = args.report;
  if (genTool) {
    // console.log(testDataReply);
    logData.error(stringify(testDataReply));
    reportReply(report, testDataReply, tempPng);
  } else if (portal) {
    // testwa.outputLogcat(Driver);
    testwaresponse.SendDataNativeApp(testDataReply.testdata, portal);
    reportReply(report, testDataReply, tempPng);
  }
}

testwa.getActionAndroid = async function(
  driver,
  req,
  httpStatus,
  httpResBody,
  command,
  jsonObj
) {
  let Driver = driver.sessions[httpResBody.sessionId];
  let caps = Driver.caps;
  let args = driver.args;

  let [action, param, commandMode, commandNotes] = this.getTranslationAction(
    command,
    jsonObj
  );

  let [memoryInfo, cpuRate] = await this.getPerformance(Driver, httpResBody);

  let [testDataReply, endTime] = testwa.genRsp(
    driver,
    req,
    httpStatus,
    httpResBody,
    action,
    param,
    commandMode,
    commandNotes,
    cpuRate,
    memoryInfo
  );

  let screenshotPath = caps.screenshotPath
    ? caps.screenshotPath
    : args.screenshotPath;
  let tempPng = screenshotPath + "/" + endTime + ".png";
  await testwa.getScreenshotAndroid(Driver, tempPng);
  testDataReply.testdata.screenshotPath = endTime + ".png";

  replyAction(driver, args, testDataReply, tempPng);
};

testwa.getActionIOS = async function(
  driver,
  req,
  httpStatus,
  httpResBody,
  commond,
  jsonObj
) {
  //only difference between ios and android is not getting performance.
  let Driver = driver.sessions[httpResBody.sessionId];
  let caps = Driver.caps;
  let args = driver.args;

  let [action, param, commandMode, commandNotes] = this.getTranslationAction(
    commond,
    jsonObj
  );

  let [testDataReply, endTime] = testwa.genRsp(
    driver,
    req,
    httpStatus,
    httpResBody,
    action,
    param,
    commandMode,
    commandNotes,
    0,
    0
  );
  let screenshotPath = caps.screenshotPath
    ? caps.screenshotPath
    : args.screenshotPath;
  let mode = Driver.caps.automationName.toLowerCase();
  if (mode === "xcuitest") {
    log.debug("Screen shot with XCUITest!");
    await this.getXcuitestScreenshot(
      Driver,
      screenshotPath,
      httpResBody.sessionId,
      endTime
    );
  } else {
    // let tempPng = screenshotPath + "/" + endTime + ".png";
    // await testwa.getScreenshotIOS(Driver,screenshotPath, endTime+".png");
    log.debug("No support for none XCUITest mode yet!");
  }
  testDataReply.testdata.screenshotPath = endTime + ".png";

  let tempPng = screenshotPath + "/" + endTime + ".png";

  replyAction(driver, args, testDataReply, tempPng);
};

//get memoryinfo and cpurate
testwa.getPerformance = async function(androidDriver, httpResBody) {
  log.debug("Getting device memeory and cpu cost!");
  let adb = androidDriver.adb;
  let caps = androidDriver.caps;
  let appName = caps.appPackage;
  try {
    let out = await adb.shell("top -n 1 -d 0.5 | grep " + appName);
    let reg_MEM = /[0-9]{1,9}([K])/g;
    let reg_CPU = /[0-9]{1,2}([%])/g;
    let memarray = out.match(reg_MEM);
    let tmpcpurate = out.match(reg_CPU);
    let memoryinfo = memarray[1];
    memoryinfo = memoryinfo.replace("K", "");
    let cpurate = tmpcpurate[0];
    cpurate = cpurate.replace("%", "");
    return [memoryinfo, cpurate];
  } catch (e) {
    log.debug("Error Getting cpu and memory info!");
    // log.debug(e);
    return [0, 0];
  }
};

testwa.getScreenshotAndroid = async function(androidDriver, tempPng) {
  const png = "/data/local/tmp/screenshot.png";
  let cmd = ["/system/bin/rm", `${png};`, "/system/bin/screencap", "-p", png];
  await androidDriver.adb.shell(cmd);
  if (await fs.exists(tempPng)) {
    await fs.unlink(tempPng);
  }
  await androidDriver.adb.pull(png, tempPng);
};

testwa.getXcuitestScreenshot = async function(
  Driver,
  screenshotPath,
  sessionId,
  endTime
) {
  let [response, body] = await Driver.wda.jwproxy.proxy(
    "/wd/hub/session/" + sessionId + "/screenshot",
    "get",
    null
  );
  body = util.safeJsonParse(body);
  await fs.writeFile(
    screenshotPath + "/" + endTime + ".png",
    body.value,
    "base64",
    err => {
      if (err) {
        log.error(err);
      }
    }
  );
};

testwa.getScreenshotIOS = async function(Driver, screenshotPath, filename) {
  // let guid = uuid.create();
  // let shotFile = `screenshot${guid}`;

  let shotFolder = screenshotPath;
  if (!(await fs.exists(shotFolder))) {
    log.debug(`Creating folder '${shotFolder}'`);
    await mkdirp(shotFolder);
  }

  let shotPath = path.resolve(shotFolder, filename);
  log.debug(`Taking screenshot: '${shotPath}'`);

  let takeScreenShot = async () => {
    await this.uiAutoClient.sendCommand(`au.capture('${shotFile}')`);

    let screenshotWaitTimeout = (this.opts.screenshotWaitTimeout || 10) * 1000;
    log.debug(
      `Waiting ${screenshotWaitTimeout} ms for screenshot to be generated.`
    );
    let startMs = Date.now();

    let success = false;
    while (Date.now() - startMs < screenshotWaitTimeout) {
      if (await fs.hasAccess(shotPath)) {
        success = true;
        break;
      }
      await B.delay(300);
    }
    if (!success) {
      throw new Error("Timed out waiting for screenshot file");
    }

    // check the rotation, and rotate if necessary
    if ((await this.getOrientation()) === "LANDSCAPE") {
      log.debug("Rotating landscape screenshot");
      // await utils.rotateImage(shotPath, -90);
    }

    // ncp(shotFolder,temp,function (err) {
    //     if (err) {
    //         return log.error(err);
    //     }
    //     log.log('screenshot done!');
    // });

    try {
      fse.copySync(temp, shotFolder);
    } catch (err) {
      log.error(err);
    }

    return;
  };
};

testwa.beforeExecuteCommand = function(driver, sessionId, command) {
  let osDriver = driver.sessions[sessionId];

  //for removeApp
  if (
    command === "removeApp" &&
    (osDriver.caps.batteryStats || driver.args.batteryStats) &&
    driver.battery &&
    osDriver
  ) {
    let platformName = osDriver.caps.platformName.toLowerCase();
    // get batterystats before app is removed for android
    if ("android" === platformName) {
      //Android device
      testwa.adbDumpBatterystats(driver, driver.battery.android.adbPath, true);
    }
  }
};
testwa.startLogcat = function startLogcat(adb, deviceLogPath, sessionId) {
  let adbPath = adb.sdkRoot + "/platform-tools/adb";
  // log.debug(`adb path: ${adbPath}`);
  let logcatProcess;
  let logcatPath = deviceLogPath;

  adb.shell(["logcat", "-c"]);

  logcatProcess = spawn(adbPath, [
    "-s",
    adb.curDeviceId,
    "shell",
    "logcat",
    "*:E"
  ]);
  logcatProcess.stdout.on("data", function(data) {
    fileSystem.appendFile(
      logcatPath + "/" + sessionId + ".log",
      data.toString(),
      function(err) {
        if (err) throw err;
      }
    );
  });
  return logcatProcess;
};
module.exports = testwa;
