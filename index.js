'use strict';

var path = require('path');

//
// Load the Config Files
//
try {
  var config = require( path.resolve( __dirname, "./config.json" ) );
  var security = require( path.resolve( __dirname, "./security.json" ) );
} catch (err) {
  console.error('Failed to load config files: ' + err.message);
  return;
}

//
// Setup our Environment
//

//
// Setup the IO
//

// Include Wiring Pi for our IO
const wpi = require('wiring-pi');

// Setup the Wiring Pi System
wpi.setup('wpi');

// Setup our LED Pin
wpi.pinMode(config.LEDPin1, wpi.OUTPUT);
wpi.pinMode(config.LEDPin2, wpi.OUTPUT);

wpi.digitalWrite(config.LEDPin1, 0);
wpi.digitalWrite(config.LEDPin2, 0);

// Blink our LEDs for good measure
blinkLED(config.LEDPin1);
blinkLED(config.LEDPin2);

// This is the pin for our button
wpi.pinMode(config.ButtonPin, wpi.INPUT);

//
// As we're connecting one side of our button to 0v, we pull up to 5v...
// So, when the button is pressed we should see 0 rather than 1
//
wpi.pullUpDnControl(config.ButtonPin, wpi.PUD_UP);

//
// Setup the IoT Hub Connection
//
var connectionString = 'HostName=' + config.HostName + ';DeviceId=' + config.DeviceId + ';SharedAccessKey=' + security.SharedAccessKey;

// use factory function from AMQP-specific package
var clientFromConnectionString = require('azure-iot-device-amqp').clientFromConnectionString;

// AMQP-specific factory function returns Client object from core package
var client = clientFromConnectionString(connectionString);

// use Message object from core package
var Message = require('azure-iot-device').Message;

// Setup our button Debounce Timer
var last_interrupt_time = 0;

function printResultFor(op) {
  return function printResult(err, res) {
    if (err) console.log(op + ' error: ' + err.toString());
    if (res) console.log(op + ' status: ' + res.constructor.name);
  };
}

// Setup a Callback for when we're connected to our IoT Hub instance
var connectCallback = function (err) {
  if (err) {
    console.error('Could not connect: ' + err);
  } else {

    // Import the 
    var raspberry = require('./raspberry');    
    
    blinkLED(config.LEDPin1);
    blinkLED(config.LEDPin2);

    console.log('Client connected');
    
    client.on('message', function (msg) {
      client.complete(msg, printResultFor('completed'));
 
      console.log("\x1b[31m",'Command = ' + msg.data);
      console.log("\x1b[0m", '------------------');

      switch (msg.data.toString())
      {

        case 'LED1':

          blinkLED(config.LEDPin1);
          break;

        case 'LED2':

          blinkLED(config.LEDPin2);
          break;     

      }

    });

    wpi.wiringPiISR(config.ButtonPin, wpi.INT_EDGE_FALLING, function(delta) {
      console.log('Pin ' + config.ButtonPin + ' changed to LOW (', delta, ')');

      var interrupt_time = wpi.millis();

      console.log(interrupt_time - last_interrupt_time);

      // If interrupts come faster than 200ms, assume it's a bounce and ignore
      if (interrupt_time - last_interrupt_time > 200) 
      {
        var sensorData = raspberry.getSensorData();
    
        var msg = new Message('Temperature = ' + sensorData.temperature + " Humidity = " + sensorData.humidity + " Button = " + wpi.digitalRead(11));
        
        msg.properties.add('severity', 'high');

        client.sendEvent(msg, function (err) {
          if (err) {
            console.log(err.toString());
          } else {
            console.log('Message sent');
            //process.exit()
          };

        }); // Client.sendEvent
    
        last_interrupt_time = interrupt_time;

      }; // if (interrupt...)

    });
  } // else {

}; // var connectCallback

//
// Finished Setup
//

// Open the connection to our IoT Hub and supply our Callback function for when it's connected
client.open(connectCallback);

function blinkLED(PinToBlink) {
  // Light up LED for 500 ms
  wpi.digitalWrite(PinToBlink, 1);
  setTimeout(function () {
    wpi.digitalWrite(PinToBlink, 0);
  }, 500);
}
