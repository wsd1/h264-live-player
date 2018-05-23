"use strict";


var FLVDemuxer = require('../flv/demux/flv-demuxer.js');
var Log = require('../flv/utils/logger.js');
var typedArray = require('../flv/utils/typedArray.js')

var Hexdump = require('../utils/hexdump.js');

var { IllegalStateException } = require('../flv/utils/exception.js')

var Avc            = require('../broadway/Decoder');
var YUVWebGLCanvas = require('../canvas/YUVWebGLCanvas');
var YUVCanvas      = require('../canvas/YUVCanvas');
var Size           = require('../utils/Size');
var Class          = require('uclass');
var Events         = require('uclass/events');
var debug          = require('debug');
var log            = debug("wsavc");

var WSAvcPlayer = new Class({
  Implements : [Events],


  initialize : function(canvas, canvastype) {

    this.canvas     = canvas;
    this.canvastype = canvastype;

    // AVC codec initialization
    this.avc = new Avc();
    if(false) this.avc.configure({
      filter: "original",
      filterHorLuma: "optimized",
      filterVerLumaEdge: "optimized",
      getBoundaryStrengthsA: "optimized"
    });

    //WebSocket variable
    this.ws;
    this.pktnum = 0;

  },

  decode : function(data) {
    var naltype = "invalid frame";

    if (data.length > 4) {
      if (data[4] == 0x65) {
        naltype = "I frame";
      }
      else if (data[4] == 0x41) {
        naltype = "P frame";
      }
      else if (data[4] == 0x67) {
        naltype = "SPS";
      }
      else if (data[4] == 0x68) {
        naltype = "PPS";
      }
    }
    //log("Passed " + naltype + " to decoder");
    this.avc.decode(data);
  },

  connect : function(url) {

    // Websocket initialization
    if (this.ws != undefined) {
      this.ws.close();
      delete this.ws;
    }
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";
    this._receivedLength = 0;

    this.ws.onopen = () => {
      log("Connected to " + url);
    };

    /*
    var framesList = [];

    this.ws.onmessage = (evt) => {
      if(typeof evt.data == "string")
        return this._on_cmd(JSON.parse(evt.data));

      this.pktnum ++;

      var frame = new Uint8Array(evt.data);
      //log("[Pkt " + this.pktnum + " (" + evt.data.byteLength + " bytes)]");
      //this.decode(frame);
      framesList.push(frame);
    };

    */

    this.ws.onmessage = this._onWebSocketMessage.bind(this);
    this.shiftFrame = this.shiftFrame.bind(this);


    this.initCanvas(640, 480);
    this.canvas.width = 640;
    this.canvas.height = 480;

    this.ws.onclose = () => {
      //running = false;
      log("WSAvcPlayer: Connection closed")

      if (this._demuxer) {
        this._demuxer.destroy();
        this._demuxer = null;
      }

    };

  },


  shiftFrame: function() {

    /*
    if(framesList.length > 10) {
      log("Dropping frames", framesList.length);
      framesList = [];
    }

    var frame = framesList.shift();

    if(frame)
      this.decode(frame);
    */


    if (!this._demuxer || !this._demuxer._videoTrack || !this._demuxer._videoTrack.samples
      || 0 === this._demuxer._videoTrack.samples.length) {
      //console.log('Imposible');
      return;
    }


    let sample = this._demuxer._videoTrack.samples.shift();

    let frameNalu = typedArray.joinArray(Uint8Array, sample.units)

    this.decode(frameNalu);

    //console.log(`frame(${frameNalu.byteLength}bytes), left ${this._demuxer._videoTrack.samples.length} frames`)

    //console.log(Hexdump.u8Array2hex(frameNalu))

    if (this._demuxer._videoTrack.samples.length > 0)
      requestAnimationFrame(this.shiftFrame);
  },



  _onWebSocketMessage: function(e) {

    if (e.data instanceof ArrayBuffer) {
      this._dispatchArrayBuffer(e.data);
    } else if (e.data instanceof Blob) {
      let reader = new FileReader();
      reader.onload = () => {
        this._dispatchArrayBuffer(reader.result);
      };
      reader.readAsArrayBuffer(e.data);
    } else {
      this._status = LoaderStatus.kError;
      let info = { code: -1, msg: 'Unsupported WebSocket message type: ' + e.data.constructor.name };

      if (this._onError) {
        this._onError(LoaderErrors.EXCEPTION, info);
      } else {
        throw new RuntimeException(info.msg);
      }
    }
  },


  _dispatchArrayBuffer: function(arraybuffer) {
    let chunk = arraybuffer;
    let byteStart = this._receivedLength;
    this._receivedLength += chunk.byteLength;

    if (this._onDataArrival) {
      this._onDataArrival(chunk, byteStart, this._receivedLength);
    }

  },

  _onDataArrival: function(data, byteStart) {
    let probeData = null;
    let consumed = 0;

    if (byteStart > 0) {
      // IOController seeked immediately after opened, byteStart > 0 callback may received
      //this._demuxer.bindDataSource(this._ioctl);
      //this._demuxer.timestampBase = this._mediaDataSource.segments[this._currentSegmentIndex].timestampBase;

      consumed = this._demuxer.parseChunks(data, byteStart);
    } else if ((probeData = FLVDemuxer.probe(data)).match) {
      // Always create new FLVDemuxer

      this._demuxer = new FLVDemuxer(probeData, {});//this._config

      /*
      let mds = this._mediaDataSource;
      if (mds.duration != undefined && !isNaN(mds.duration)) {
        this._demuxer.overridedDuration = mds.duration;
      }
      if (typeof mds.hasAudio === 'boolean') {
        this._demuxer.overridedHasAudio = mds.hasAudio;
      }
      if (typeof mds.hasVideo === 'boolean') {
        this._demuxer.overridedHasVideo = mds.hasVideo;
      }

      this._demuxer.timestampBase = mds.segments[this._currentSegmentIndex].timestampBase;
      */
      this._demuxer.onError = this._onDemuxException.bind(this);
      this._demuxer.onMediaInfo = this._onMediaInfo.bind(this);
      this._demuxer.onMetaDataArrived = this._onMetaDataArrived.bind(this);
      /*
      this._remuxer.bindDataSource(this._demuxer
        .bindDataSource(this._ioctl
        ));

      this._remuxer.onInitSegment = this._onRemuxerInitSegmentArrival.bind(this);
      this._remuxer.onMediaSegment = this._onRemuxerMediaSegmentArrival.bind(this);

      */

      this._demuxer.onTrackMetadata = this._onTrackMetadataReceived.bind(this);
      this._demuxer.onDataAvailable = this._render.bind(this);


      consumed = this._demuxer.parseChunks(data, byteStart);
    } else {
      /*
      probeData = null;
      Log.e(this.TAG, 'Non-FLV, Unsupported media type!');
      Promise.resolve().then(() => {
        this._internalAbort();
      });
      this._emitter.emit(TransmuxingEvents.DEMUX_ERROR, DemuxErrors.FORMAT_UNSUPPORTED, 'Non-FLV, Unsupported media type');
      */
      consumed = 0;
    }

    return consumed;
  },

  _render: function (audioTrack, videoTrack){

    this.shiftFrame();
  },

  _onDemuxException: function(type, info) {
    Log.e(this.TAG, `DemuxException: type = ${type}, info = ${info}`);
    //this._emitter.emit(TransmuxingEvents.DEMUX_ERROR, type, info);
  },

  _onMediaInfo: function(mediaInfo) {
    if (this._mediaInfo == null) {
      // Store first segment's mediainfo as global mediaInfo
      this._mediaInfo = Object.assign({}, mediaInfo);
      this._mediaInfo.keyframesIndex = null;
      this._mediaInfo.segments = [];
      this._mediaInfo.segmentCount = this._mediaDataSource.segments.length;
      Object.setPrototypeOf(this._mediaInfo, MediaInfo.prototype);
    }

    let segmentInfo = Object.assign({}, mediaInfo);
    Object.setPrototypeOf(segmentInfo, MediaInfo.prototype);
    this._mediaInfo.segments[this._currentSegmentIndex] = segmentInfo;

    // notify mediaInfo update
    this._reportSegmentMediaInfo(this._currentSegmentIndex);

    if (this._pendingSeekTime != null) {
      Promise.resolve().then(() => {
        let target = this._pendingSeekTime;
        this._pendingSeekTime = null;
        this.seek(target);
      });
    }
  },

  _onMetaDataArrived: function(metadata) {
  //  this._emitter.emit(TransmuxingEvents.METADATA_ARRIVED, metadata);
  },

  _onTrackMetadataReceived: function(type, metadata) {
    let metabox = null;

    let container = 'mp4';
    let codec = metadata.codec;

    if (type === 'audio') {
      this._audioMeta = metadata;
      if (metadata.codec === 'mp3' && this._mp3UseMpegAudio) {
        // 'audio/mpeg' for MP3 audio track
        container = 'mpeg';
        codec = '';
        metabox = new Uint8Array();
      } else {
        // 'audio/mp4, codecs="codec"'
        //metabox = MP4.generateInitSegment(metadata);
      }
    } else if (type === 'video') {
      this._videoMeta = metadata;
      //metabox = MP4.generateInitSegment(metadata);
    } else {
      return;
    }

    /*
    // dispatch metabox (Initialization Segment)
    if (!this._onInitSegment) {
      throw new IllegalStateException('MP4Remuxer: onInitSegment callback must be specified!');
    }
    this._onInitSegment(type, {
      type: type,
      data: metabox.buffer,
      codec: codec,
      container: `${type}/${container}`,
      mediaDuration: metadata.duration  // in timescale 1000 (milliseconds)
    });
    */

  },

  initCanvas : function(width, height) {
    var canvasFactory = this.canvastype == "webgl" || this.canvastype == "YUVWebGLCanvas"
                        ? YUVWebGLCanvas
                        : YUVCanvas;

    var canvas = new canvasFactory(this.canvas, new Size(width, height));
    this.avc.onPictureDecoded = canvas.decode;
    this.emit("canvasReady", width, height);
  },

  _on_cmd : function(cmd){
    log("Incoming request", cmd);

    if(cmd.action == "init") {
      this.initCanvas(cmd.width, cmd.height);
      this.canvas.width  = cmd.width;
      this.canvas.height = cmd.height;
    }
  },

  disconnect : function() {
    this.ws.close();
  },

  playStream : function() {
    var message = "REQUESTSTREAM ";
    this.ws.send(message);
    log("Sent " + message);
  },


  stopStream : function() {
    this.ws.send("STOPSTREAM");
    log("Sent STOPSTREAM");
  },
});


module.exports = WSAvcPlayer;
module.exports.debug = debug;
