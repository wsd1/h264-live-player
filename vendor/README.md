# Motivation

This is a very efficient h264 video player (that can run on live stream) for your browser.
You might use this with raspicam raw h264 stream.

This is a player around [Broadway](https://github.com/mbebenita/Broadway) Decoder, with very simple API.
NAL unit (h264 frames) are split on the server side, so the client side is very simple (and allow frame skipping easily)


See [github sample project's page for more information](https://github.com/131/h264-live-player)

# 参考

flv格式：

https://wuyuans.com/2012/08/flv-format/

NALU

https://stackoverflow.com/questions/24884827/possible-locations-for-sequence-picture-parameter-sets-for-h-264-stream

