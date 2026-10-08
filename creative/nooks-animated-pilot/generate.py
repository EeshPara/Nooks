from pathlib import Path
import concurrent.futures, json, subprocess

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
BASE = 'Animate this exact reference as a very quiet living study background. Perfectly locked tripod camera: absolutely zero pan, zoom, tilt, parallax, framing drift or cuts. Preserve the original composition, lighting, architecture and every object. Motion is tiny, localized, continuous and natural. No added people, animals, furniture, text, particles or magic effects. No flashing, drastic brightness changes or moving furniture. The final frame returns seamlessly to the identical starting composition. Silent eight-second seamless cinemagraph loop. '
PROMPTS = {
 'rainy-library': BASE + 'Only the existing rain on the large window slowly trickles down outside the interior. Very faint steam rises a short distance above the blue floral coffee cup at the lower left of the desk, thin transparent wisps rather than smoke. Warm existing lamps breathe imperceptibly with a very gentle 2 percent glow variation; no lamps switch off. The skyline, books, plants, room and desk are perfectly still. Rain must remain confined to the window glass. No animal exists here; do not add one.',
 'howls-moving-study': BASE + 'Only the orange fire inside the small black iron stove near the center-left of the room flickers softly within the stove opening. One delicate transparent wisp of steam rises just above the blue floral cup at the lower left-center of the desk. The existing small sleeping gray cat on the floor beneath the armchair makes a tiny slow breathing motion and once subtly twitches an ear, staying curled in the exact same spot. Keep cat anatomy intact, never stand or walk. Tiny warm lantern glow variation. All landscape, flowers, gears, furniture and walls remain frozen. No drifting camera and no moving landscape.',
 'gryffindor-common-room': BASE + 'Only the existing fire on the left naturally flickers at low intensity within the stone fireplace, with very subtle warm reflected glow immediately around its opening. The existing sleeping orange cat curled on the red armchair just left of center breathes very slowly and gives one tiny ear twitch without changing position. Keep cat anatomy exactly intact, no head lift, no standing or walking. Existing candle flames move just a little. Everything else including furniture, books, portraits, window and room stays completely still. No added embers flying into the room, no smoke, no new animals.'
}

def generate(item):
 name, prompt = item
 target=OUT/name
 target.mkdir(exist_ok=True)
 (target/'prompt.txt').write_text(prompt)
 source=ROOT/'web/ui/public/images/nooks-50'/f'{name}.webp'
 args=['higgsfield','generate','create','seedance1_5','--prompt',prompt,'--start-image',str(source),'--end-image',str(source),'--duration','8','--resolution','720p','--aspect_ratio','16:9','--generate-audio','false','--wait','--wait-timeout','20m','--wait-interval','5s','--json']
 with (target/'job.json').open('w') as out, (target/'generation.log').open('w') as err:
  result=subprocess.run(args, stdout=out, stderr=err)
 print(name, 'finished' if result.returncode == 0 else 'failed', flush=True)
 return {'id':name,'exit_code':result.returncode}

if __name__=='__main__':
 (OUT/'generation-spec.json').write_text(json.dumps({'model':'seedance1_5','duration_seconds':8,'resolution':'720p','audio':False,'balance_before':206.07,'prompts':PROMPTS}, indent=2))
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  results=list(pool.map(generate,PROMPTS.items()))
 print(json.dumps(results))
