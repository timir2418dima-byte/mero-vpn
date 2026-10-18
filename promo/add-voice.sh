#!/usr/bin/env bash
# Mix a voiceover into the MERO chroma-key banner.
# Usage: bash add-voice.sh voice.mp3
# The video is trimmed from the Gemini source so the voice starts as the robot appears;
# the green hold at the end stretches to fit the voice (the source holds still until 10 s).
set -euo pipefail
cd "$(dirname "$0")"
SRC="C:/Users/doting/Downloads/gemini_generated_video_3009611e.mp4"
VOICE="${1:?pass the voiceover file}"
START=0.30          # first frame with the robot
VOICE_AT=0.35       # voice offset inside the trimmed clip, seconds
MIN_END=7.5         # trimmed length without voice
MAX_END=9.7         # source is 10 s long

vdur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VOICE")
end=$(awk -v v="$vdur" -v a="$VOICE_AT" -v mn="$MIN_END" -v mx="$MAX_END" 'BEGIN{e=a+v+0.6; if(e<mn)e=mn; if(e>mx)e=mx; printf "%.2f", e}')
fade=$(awk -v e="$end" 'BEGIN{printf "%.2f", e-0.4}')
delay=$(awk -v a="$VOICE_AT" 'BEGIN{printf "%d", a*1000}')

ffmpeg -v error -y -ss "$START" -t "$end" -i "$SRC" -i "$VOICE" \
  -filter_complex "[0:a]volume=0.45[sfx];[1:a]aresample=48000,highpass=f=80,acompressor=threshold=-18dB:ratio=3:attack=5:release=120,adelay=${delay}|${delay},volume=1.6[vo];[sfx][vo]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95,afade=t=out:st=${fade}:d=0.4[a]" \
  -map 0:v -map "[a]" -c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p -r 24 -c:a aac -b:a 192k -movflags +faststart \
  mero_banner_voice.mp4
echo "mero_banner_voice.mp4: ${end}s, voice ${vdur}s"
