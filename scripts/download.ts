import fs from 'fs';
import path from 'path';

const API_URL = "https://en.wikipedia.org/w/api.php";
const COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php";

const aires = [
  { id: "talassemtane", search: "Parc national de Talassemtane" },
  { id: "alhoceima", search: "Parc national d'Al Hoceima" },
  { id: "bouhachem", search: "Bouhachem" },
  { id: "jbelmoussa", search: "Jbel Moussa" },
  { id: "koudiattaifour", search: "Cabo Negro Morocco" },
  { id: "rbim", search: "Strait of Gibraltar" },
  { id: "tahaddart", search: "Tahaddart" },
  { id: "smir", search: "M'diq lagoon" }
];

async function getImage(searchQuery) {
  try {
    const res = await fetch(`${COMMONS_API_URL}?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(searchQuery)}|filetype:bitmap&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url`);
    const data = await res.json();
    if (data.query && data.query.pages) {
      const pages = data.query.pages;
      const pageId = Object.keys(pages)[0];
      return pages[pageId].imageinfo[0].url;
    }
  } catch(e) {
    console.error(e);
  }

  // fallback to generic wikimedia search without filetype if none found
  try {
    const res = await fetch(`${COMMONS_API_URL}?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(searchQuery)}&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url`);
    const data = await res.json();
    if (data.query && data.query.pages) {
      const pages = data.query.pages;
      const pageId = Object.keys(pages)[0];
      return pages[pageId].imageinfo[0].url;
    }
  } catch(e) {
    console.error(e);
  }
  return null;
}

async function run() {
  const dir = path.join(process.cwd(), 'public', 'images', 'aires');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  for (const aire of aires) {
    let imgUrl = await getImage(aire.search);

    // Hardcode some better ones if search fails to find a good one
    if (aire.id === "talassemtane") imgUrl = "https://upload.wikimedia.org/wikipedia/commons/1/15/Parque_Nacional_Talassemtane.jpg";
    if (aire.id === "alhoceima") imgUrl = "https://upload.wikimedia.org/wikipedia/commons/2/2f/Alhoceima_National_Park.jpg";
    if (aire.id === "bouhachem") imgUrl = "https://upload.wikimedia.org/wikipedia/commons/3/3d/For%C3%AAt_Bouhachem.jpg";
    if (aire.id === "jbelmoussa") imgUrl = "https://upload.wikimedia.org/wikipedia/commons/a/ad/Jbel_Moussa_Belyounech.jpg";
    if (aire.id === "koudiattaifour") imgUrl = "https://upload.wikimedia.org/wikipedia/commons/5/52/Plage_cabo_negro.jpg";
    if (aire.id === "rbim") imgUrl = "https://upload.wikimedia.org/wikipedia/commons/3/30/Strait_of_Gibraltar_from_space.jpg";
    if (aire.id === "tahaddart") imgUrl = "https://upload.wikimedia.org/wikipedia/commons/7/75/Oued_Tahaddart.jpg";
    if (aire.id === "smir") imgUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Laguna_de_Smir_-_panoramio.jpg/800px-Laguna_de_Smir_-_panoramio.jpg";

    if (!imgUrl) continue;

    console.log(`Downloading ${aire.id} from ${imgUrl}`);
    try {
      const res = await fetch(imgUrl);
      const buffer = await res.arrayBuffer();
      fs.writeFileSync(path.join(dir, `${aire.id}.jpg`), Buffer.from(buffer));
      console.log(`Saved ${aire.id}.jpg`);
    } catch(e) {
      console.error(`Failed to download ${aire.id}: ${e}`);
    }
  }
}

run();
