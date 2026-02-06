import * as THREE from 'three';
import { GLTFLoader } from 'gltf';

// Variables de démarrage
let sceneStarted = false;
let startScreen = document.getElementById('startScreen');

let canvas = document.querySelector('#myCanvas');
// Plein écran: supprime les marges et force le canvas à occuper toute la fenêtre
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
let renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
// Fond sombre
renderer.setClearColor(0x1a1a1a, 1.0);
let scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);
let camera = new THREE.PerspectiveCamera(75,
    window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(6, 3, 12);
camera.lookAt(0, -1, 0);
scene.add(camera);

// Audio Listener
const listener = new THREE.AudioListener();
camera.add(listener);

// Global Audio source
const sound = new THREE.Audio(listener);

// Load a sound and set it as the Audio object's buffer
const audioLoader = new THREE.AudioLoader();
audioLoader.load('assets/audio/soundtrack.mp3', function(buffer) {
    sound.setBuffer(buffer);
    sound.setLoop(true);
    sound.setVolume(0.5);
});

let hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);
let dirLight = new THREE.DirectionalLight(0xffffff);
dirLight.position.set(3, 10, 10);
scene.add(dirLight);
let hlight = new THREE.AmbientLight(0xffffff, 1);
scene.add(hlight);

// Gestion du redimensionnement pour occuper toute la fenêtre
function onResize() {
    let w = window.innerWidth;
    let h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

// Dimensions globales de la route (utilisées aussi pour les mouvements)
let ROAD_LENGTH = 1000;
let ROAD_WIDTH = 12;
let SIDEWALK_WIDTH = 2.2; // largeur d'un trottoir
let SIDEWALK_HEIGHT = 0.15; // hauteur du trottoir au-dessus de la route
let BUILDING_SPACING = 24; // espacement entre immeubles le long de Z
let BUILDING_MIN_W = 6;
let BUILDING_MAX_W = 12; // largeur sur X
let BUILDING_MIN_D = 8;
let BUILDING_MAX_D = 16; // profondeur sur Z
let BUILDING_MIN_H = 8;
let BUILDING_MAX_H = 42; // hauteur

// Sirènes en triangles lumineux (rouge/bleu)
let sirenTriGroupR = null,
    sirenTriGroupB = null;
let sirenTriMatR = null,
    sirenTriMatB = null;
let sirenLightR = null,
    sirenLightB = null;

// Etat déplacement voiture
let carSpeed = 18; // m/s approximatifs (plus visible)
let lateralSpeed = 5; // vitesse latérale
let steer = 0; // -1 gauche, 1 droite
let lastTs = 0;
let keys = { left: false, right: false };

window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keys.left = true;
        e.preventDefault();
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keys.right = true;
        e.preventDefault();
    }
});
window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keys.left = false;
        e.preventDefault();
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keys.right = false;
        e.preventDefault();
    }
});

function buildTriangleGeometry(baseSize = 0.06) {
    let r = baseSize;
    let geo = new THREE.BufferGeometry();
    let verts = new Float32Array([
        0, r, 0, -r * 0.866, -r * 0.5, 0,
        r * 0.866, -r * 0.5, 0
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    return geo;
}

function createTriangleCloudForSiren(sirenMesh, colorHex, count = 140) {
    // Crée un nuage de petits triangles additifs dans le volume du mesh du gyrophare
    if (!sirenMesh.geometry) return null;
    if (!sirenMesh.geometry.boundingBox) sirenMesh.geometry.computeBoundingBox();
    let localBox = sirenMesh.geometry.boundingBox ? sirenMesh.geometry.boundingBox.clone() : new THREE.Box3(new THREE.Vector3(-0.1, -0.05, -0.1), new THREE.Vector3(0.1, 0.05, 0.1));
    let size = localBox.getSize(new THREE.Vector3());
    let center = localBox.getCenter(new THREE.Vector3());

    let triGeo = buildTriangleGeometry(Math.max(0.02, Math.min(size.x, size.y) * 0.18));
    let mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
    let inst = new THREE.InstancedMesh(triGeo, mat, count);
    let group = new THREE.Group();

    for (let i = 0; i < count; i++) {
        let px = center.x + (Math.random() - 0.5) * size.x * 0.95;
        let py = center.y + (Math.random() - 0.5) * size.y * 0.95;
        let pz = center.z + (Math.random() - 0.5) * size.z * 0.95;
        let s = 0.6 + Math.random() * 0.8;
        let rx = Math.random() * Math.PI;
        let ry = Math.random() * Math.PI;
        let rz = Math.random() * Math.PI;
        let m = new THREE.Matrix4()
            .makeRotationFromEuler(new THREE.Euler(rx, ry, rz))
            .multiply(new THREE.Matrix4().makeScale(s, s, s))
            .setPosition(px, py, pz);
        inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;

    group.position.copy(sirenMesh.position);
    group.quaternion.copy(sirenMesh.quaternion);
    group.scale.copy(sirenMesh.scale);
    group.add(inst);

    // Lumière au centre local de la boîte
    // Lumière plus intense et portée plus grande
    let light = new THREE.PointLight(colorHex, 0.0, Math.max(30, size.length() * 25), 1.0);
    light.position.copy(center);
    group.add(light);

    // Masquer le mesh d'origine et attacher le remplaçant
    sirenMesh.visible = false;
    sirenMesh.parent.add(group);

    return { group, mat, light };
}

function findSirenMeshes(root) {
    // Heuristique: prendre les meshes dans la partie supérieure du modèle qui soit nommé, soit dans la zone typique d'un gyrophare
    if (!root) return { left: null, right: null };
    root.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(root);
    let size = box.getSize(new THREE.Vector3());
    let yCut = box.max.y - size.y * 0.28;
    let nameHints = /siren|gyro|lightbar|beacon|police[_-]?light|led/i;
    let nameMatches = [];
    let cands = [];
    root.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        let b = new THREE.Box3().setFromObject(o);
        let s = b.getSize(new THREE.Vector3());
        let c = b.getCenter(new THREE.Vector3());
        let vol = s.x * s.y * s.z;
        if (o.name && nameHints.test(o.name)) {
            nameMatches.push({ mesh: o, c, s, vol });
        }
        if (c.y >= yCut && vol > 0) {
            cands.push({ mesh: o, c, s, vol });
        }
    });
    let pool = nameMatches.length >= 2 ? nameMatches : cands;
    if (pool.length === 0) return { left: null, right: null };
    pool.sort((a, b) => (b.c.y - a.c.y) || (a.vol - b.vol));
    let left = null,
        right = null;
    for (let it of pool.slice(0, Math.min(16, pool.length))) {
        if (!left || it.c.x < left.c.x) left = it;
        if (!right || it.c.x > right.c.x) right = it;
    }
    return { left: left ? left.mesh : null, right: right ? right.mesh : null };
}
// Route: plane asphalte + lignes
function createRoad() {
    let group = new THREE.Group();
    let roadLength = ROAD_LENGTH;
    let roadWidth = ROAD_WIDTH;

    // Asphalte
    let planeGeo = new THREE.PlaneGeometry(roadWidth, roadLength);
    let planeMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2f, roughness: 0.95, metalness: 0.0 });
    let asphalt = new THREE.Mesh(planeGeo, planeMat);
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.receiveShadow = true;
    group.add(asphalt);

    // Lignes latérales
    let sideMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    let sideGeo = new THREE.PlaneGeometry(0.15, roadLength);
    let leftLine = new THREE.Mesh(sideGeo, sideMat);
    leftLine.rotation.x = -Math.PI / 2;
    leftLine.position.set(-roadWidth * 0.5 + 0.5, 0.001, 0);
    let rightLine = leftLine.clone();
    rightLine.position.x = roadWidth * 0.5 - 0.5;
    group.add(leftLine, rightLine);

    // Pointillés centraux
    let dashMat = new THREE.MeshBasicMaterial({ color: 0xffffee });
    let dashGeo = new THREE.PlaneGeometry(0.25, 3);
    for (let z = -roadLength * 0.5 + 2; z < roadLength * 0.5; z += 6) {
        let dash = new THREE.Mesh(dashGeo, dashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(0, 0.002, z);
        group.add(dash);
    }

    return group;
}

// Trottoirs (gauche/droite) le long de la route
function createSidewalks() {
    let group = new THREE.Group();
    let roadLength = ROAD_LENGTH;
    let curbMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.8, metalness: 0.0 });
    let geo = new THREE.BoxGeometry(SIDEWALK_WIDTH, SIDEWALK_HEIGHT, roadLength);
    let left = new THREE.Mesh(geo, curbMat);
    let right = new THREE.Mesh(geo, curbMat);
    left.position.set(-ROAD_WIDTH * 0.5 - SIDEWALK_WIDTH * 0.5, SIDEWALK_HEIGHT * 0.5, 0);
    right.position.set(ROAD_WIDTH * 0.5 + SIDEWALK_WIDTH * 0.5, SIDEWALK_HEIGHT * 0.5, 0);
    left.castShadow = false;
    left.receiveShadow = true;
    right.castShadow = false;
    right.receiveShadow = true;
    group.add(left, right);

    // Liseré/texture simple sur le bord intérieur (optionnel: lignes blanches)
    let edgeGeo = new THREE.PlaneGeometry(0.1, roadLength);
    let edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    let edgeL = new THREE.Mesh(edgeGeo, edgeMat);
    edgeL.rotation.x = -Math.PI / 2;
    edgeL.position.set(-ROAD_WIDTH * 0.5 - 0.05, SIDEWALK_HEIGHT + 0.002, 0);
    let edgeR = edgeL.clone();
    edgeR.position.x = ROAD_WIDTH * 0.5 + 0.05;
    group.add(edgeL, edgeR);

    return group;
}

// Rangées d'immeubles le long des deux côtés de la route
function createBuildings() {
    let group = new THREE.Group();
    let baseY = 0; // sera placé par parent
    let makeMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.05 });
    let palette = [0x9aa0a6, 0x7e8a97, 0x6d7785, 0xb0b8c0, 0x8e9aa6];

    for (let z = -ROAD_LENGTH * 0.5 + 10; z < ROAD_LENGTH * 0.5 - 10; z += BUILDING_SPACING) {
        for (let side of[-1, 1]) {
            let w = THREE.MathUtils.randInt(BUILDING_MIN_W, BUILDING_MAX_W);
            let d = THREE.MathUtils.randInt(BUILDING_MIN_D, BUILDING_MAX_D);
            let h = THREE.MathUtils.randInt(BUILDING_MIN_H, BUILDING_MAX_H);
            let mat = makeMat(palette[THREE.MathUtils.randInt(0, palette.length - 1)]);
            let geo = new THREE.BoxGeometry(w, h, d);
            let mesh = new THREE.Mesh(geo, mat);
            // Positionner en X en dehors du trottoir, avec un petit retrait
            let sidewalkOuterX = side * (ROAD_WIDTH * 0.5 + SIDEWALK_WIDTH);
            let clearance = 2.0;
            let x = sidewalkOuterX + side * (d * 0.5 + clearance); // d sur Z, w sur X, on pousse en X via profondeur comme marge
            mesh.position.set(x, h * 0.5, z + THREE.MathUtils.randFloatSpread(6));
            mesh.castShadow = false;
            mesh.receiveShadow = true;
            group.add(mesh);

            // Toits simples: petit cube ou antenne
            if (Math.random() < 0.35) {
                let th = THREE.MathUtils.randFloat(1.0, 3.0);
                let tw = THREE.MathUtils.randFloat(0.6, 1.2);
                let tgeo = new THREE.BoxGeometry(tw, th, tw);
                let tmesh = new THREE.Mesh(tgeo, makeMat(0x555b66));
                tmesh.position.set(x + THREE.MathUtils.randFloatSpread(w * 0.5), h + th * 0.5, mesh.position.z + THREE.MathUtils.randFloatSpread(d * 0.5));
                group.add(tmesh);
            }
        }
    }
    return group;
}

// Oriente le modèle pour que son axe principal (longueur) soit aligné avec l'axe Z de la route
function alignModelAxisToRoad(obj) {
    try {
        let original = obj.rotation.y;
        let bestYaw = original;
        let bestScore = -Infinity;
        let yaws = [0, Math.PI / 2, -Math.PI / 2, Math.PI];
        for (let yaw of yaws) {
            obj.rotation.y = yaw;
            let b = new THREE.Box3().setFromObject(obj);
            let s = b.getSize(new THREE.Vector3());
            let score = s.z - s.x; // on préfère maximiser la longueur sur Z
            if (score > bestScore) {
                bestScore = score;
                bestYaw = yaw;
            }
        }
        obj.rotation.y = bestYaw;
    } catch (_) { /* ignore */ }
}

// Oriente la voiture pour que son "avant" pointe au mieux vers -Z (sens de circulation de la route)
function orientModelForwardToMinusZ(obj) {
    try {
        let target = new THREE.Vector3(0, 0, -1);
        let yaws = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
        let bestYaw = obj.rotation.y;
        let bestScore = -Infinity;
        for (let yaw of yaws) {
            obj.rotation.y = yaw;
            let q = new THREE.Quaternion();
            obj.getWorldQuaternion(q);
            let vx = new THREE.Vector3(1, 0, 0).applyQuaternion(q); // hypothèse avant = +X
            let vz = new THREE.Vector3(0, 0, 1).applyQuaternion(q); // hypothèse avant = +Z
            vx.y = 0;
            vz.y = 0;
            if (vx.lengthSq() > 0) vx.normalize();
            if (vz.lengthSq() > 0) vz.normalize();
            let score = Math.max(vx.dot(target), vz.dot(target));
            if (score > bestScore) {
                bestScore = score;
                bestYaw = yaw;
            }
        }
        // Applique le yaw sélectionné, puis un léger biais vers la gauche (+Y) ~5°
        // Applique le yaw sélectionné, puis un biais un peu plus marqué vers la gauche (+Y) ~10°
        obj.rotation.y = bestYaw + (Math.PI / (7));
    } catch (_) { /* ignore */ }
}

// Oriente le bus pour que son "avant" pointe au mieux vers +Z (sens opposé à la voiture)
function orientModelForwardToPlusZ(obj) {
    try {
        let target = new THREE.Vector3(0, 0, -1); // sens opposé (+Z)
        let yaws = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
        let bestYaw = obj.rotation.y;
        let bestScore = -Infinity;
        for (let yaw of yaws) {
            obj.rotation.y = yaw;
            let q = new THREE.Quaternion();
            obj.getWorldQuaternion(q);
            let vx = new THREE.Vector3(1, 0, 0).applyQuaternion(q); // hypothèse avant = +X
            let vz = new THREE.Vector3(0, 0, 1).applyQuaternion(q); // hypothèse avant = +Z
            vx.y = 0;
            vz.y = 0;
            if (vx.lengthSq() > 0) vx.normalize();
            if (vz.lengthSq() > 0) vz.normalize();
            let score = Math.max(vx.dot(target), vz.dot(target));
            if (score > bestScore) {
                bestScore = score;
                bestYaw = yaw;
            }
        }
        // Pas de biais supplémentaire - orientation pure vers +Z
        obj.rotation.y = bestYaw + (Math.PI / (7));
    } catch (_) { /* ignore */ }
}

let model = undefined;
let busModel = undefined;
let loader = new GLTFLoader();

// Calcul des positions initiales pour collision à ~26s
// Voiture: vitesse ~18 m/s vers -Z, distance = 18 × 26 = 468m → z = +468
// Bus: vitesse ~16.2 m/s vers +Z, distance = 16.2 × 26 = 421m → z = -421
// Ils se rencontrent vers z = 0 après ~26s

let data = await loader.loadAsync('assets/police_car/police_car.gltf');
if (data) {
    model = data.scene;
    model.scale.set(2, 2, 2);
    model.position.y -= 1.5;
    // Position initiale: loin derrière (vers +Z)
    model.position.z = 468;
    model.position.x = 0;
    scene.add(model);

    // Aligner immédiatement la voiture sur la route et pointer vers -Z
    try {
        alignModelAxisToRoad(model);
        orientModelForwardToMinusZ(model);
    } catch (_) { /* ignore */ }

    // Placer une route sous la voiture (à la hauteur du bas du modèle)
    try {
        let box = new THREE.Box3().setFromObject(model);
        let minY = box.min.y;
        let road = createRoad();
        road.position.y = minY - 0.02; // un léger décalage pour éviter le z-fight
        scene.add(road);

        // Ajouter trottoirs et immeubles autour
        let sidewalks = createSidewalks();
        sidewalks.position.y = road.position.y; // base route
        scene.add(sidewalks);

        let buildings = createBuildings();
        buildings.position.y = road.position.y; // au sol
        scene.add(buildings);
    } catch (e) {
        // fallback: route fixe si bounding box échoue
        let road = createRoad();
        road.position.y = -2.0;
        scene.add(road);
        let sidewalks = createSidewalks();
        sidewalks.position.y = road.position.y;
        scene.add(sidewalks);
        let buildings = createBuildings();
        buildings.position.y = road.position.y;
        scene.add(buildings);
    }

    // Remplacer les gyrophares DU MODELE par des triangles lumineux
    try {
        let { left, right } = findSirenMeshes(model);
        if (left || right) {
            console.log('Siren mesh candidates:', {
                left: left ? left.name : null,
                right: right ? right.name : null
            });
        } else {
            console.warn('No siren meshes detected by heuristic; triangles will not be placed.');
        }
        if (left && right) {
            let r = createTriangleCloudForSiren(left, 0xff3333, 160);
            if (r) {
                sirenTriGroupR = r.group;
                sirenTriMatR = r.mat;
                sirenLightR = r.light;
            }
            let b = createTriangleCloudForSiren(right, 0x66aaff, 160);
            if (b) {
                sirenTriGroupB = b.group;
                sirenTriMatB = b.mat;
                sirenLightB = b.light;
            }
        } else if (left && !right) {
            // Fallback: un seul mesh (barre lumineuse). Duplique en décalant gauche/ droite.
            let r = createTriangleCloudForSiren(left, 0xff3333, 160);
            let b = createTriangleCloudForSiren(left, 0x66aaff, 160);
            if (r) {
                sirenTriGroupR = r.group;
                sirenTriMatR = r.mat;
                sirenLightR = r.light;
            }
            if (b) {
                sirenTriGroupB = b.group;
                sirenTriMatB = b.mat;
                sirenLightB = b.light;
            }
            try {
                if (left.geometry && !left.geometry.boundingBox) left.geometry.computeBoundingBox();
                let lb = left.geometry && left.geometry.boundingBox ? left.geometry.boundingBox : new THREE.Box3(new THREE.Vector3(-0.1, 0, -0.1), new THREE.Vector3(0.1, 0, 0.1));
                let s = lb.getSize(new THREE.Vector3());
                let dx = Math.max(0.05, s.x * 0.35);
                if (sirenTriGroupR) sirenTriGroupR.position.x -= dx;
                if (sirenTriGroupB) sirenTriGroupB.position.x += dx;
            } catch (_) { /* ignore */ }
        } else if (!left && right) {
            let r = createTriangleCloudForSiren(right, 0xff3333, 160);
            let b = createTriangleCloudForSiren(right, 0x66aaff, 160);
            if (r) {
                sirenTriGroupR = r.group;
                sirenTriMatR = r.mat;
                sirenLightR = r.light;
            }
            if (b) {
                sirenTriGroupB = b.group;
                sirenTriMatB = b.mat;
                sirenLightB = b.light;
            }
            try {
                if (right.geometry && !right.geometry.boundingBox) right.geometry.computeBoundingBox();
                let lb = right.geometry && right.geometry.boundingBox ? right.geometry.boundingBox : new THREE.Box3(new THREE.Vector3(-0.1, 0, -0.1), new THREE.Vector3(0.1, 0, 0.1));
                let s = lb.getSize(new THREE.Vector3());
                let dx = Math.max(0.05, s.x * 0.35);
                if (sirenTriGroupR) sirenTriGroupR.position.x -= dx;
                if (sirenTriGroupB) sirenTriGroupB.position.x += dx;
            } catch (_) { /* ignore */ }
        }
    } catch (e) { console.warn('Siren replacement failed', e); }

    // (déjà alignée ci-dessus)
}

// Charger le bus
let busData = await loader.loadAsync('assets/bus/bus.gltf');
if (busData) {
    busModel = busData.scene;
    busModel.scale.set(2, 2, 2);
    busModel.position.y -= 1.5;
    // Position initiale: loin devant (vers -Z)
    busModel.position.z = -421;
    busModel.position.x = 0;
    scene.add(busModel);

    // Orienter le bus vers +Z (contre-sens) avec la même logique que la voiture
    try {
        alignModelAxisToRoad(busModel);
        orientModelForwardToPlusZ(busModel);
        // Rotation de 200° pour mettre le bus dans le bon sens
        busModel.rotation.y += Math.PI * (185 / 180);
    } catch (_) { /* ignore */ }
}

// ===== SYSTÈME DE CAMÉRAS CINÉMATIQUES =====
let cinematicMode = false;
let cinematicTime = 0;
let cinematicStartTime = 0;

// États de caméra
let cameraStates = {
    followCar: { active: false },
    carProfile: { active: false, offset: new THREE.Vector3(15, 2, 0) },
    busProfile: { active: false, offset: new THREE.Vector3(-15, 2, 0) },
    carFront: { active: false, offset: new THREE.Vector3(0, 1.5, -8) },
    busFront: { active: false, offset: new THREE.Vector3(0, 1.5, 8) },
    topView: { active: false, height: 35, lookDown: true }
};

// Timeline des caméras (temps en secondes)
// Total: 30s, collision à ~26s pendant la vue du dessus
let cameraTimeline = [
    { start: 0, end: 6, state: 'followCar' }, // 0-6s: suivi voiture normal (6s)
    { start: 6, end: 12, state: 'carProfile' }, // 6-12s: profil voiture (6s)
    { start: 12, end: 18, state: 'busProfile' }, // 12-18s: profil bus (6s)
    { start: 18, end: 21, state: 'carFront' }, // 18-21s: face voiture (3s)
    { start: 21, end: 24, state: 'busFront' }, // 21-24s: face bus (3s)
    { start: 24, end: 35, state: 'topView' } // 24-35s: vue du dessus (11s - collision à ~26s)
];

function updateCinematicCamera(dt) {
    if (!cinematicMode) return;

    cinematicTime += dt;

    // Fin de la cinématique : affichage de l'écran de prévention
    if (cinematicTime > 35) {
        let screen = document.getElementById('preventionScreen');
        if (screen) screen.classList.add('visible');
    }

    // Trouver l'état actuel de la caméra
    let currentState = null;
    for (let segment of cameraTimeline) {
        if (cinematicTime >= segment.start && cinematicTime < segment.end) {
            currentState = segment.state;
            break;
        }
    }

    if (!currentState) return;

    let targetPos = new THREE.Vector3();
    let lookAtPos = new THREE.Vector3();

    switch (currentState) {
        case 'followCar':
            if (model) {
                targetPos.set(model.position.x, model.position.y + 3.5, model.position.z + 12);
                lookAtPos.set(model.position.x, model.position.y + 0.8, model.position.z);
            }
            break;

        case 'carProfile':
            if (model) {
                let offset = cameraStates.carProfile.offset;
                targetPos.set(model.position.x + offset.x, model.position.y + offset.y, model.position.z + offset.z);
                lookAtPos.copy(model.position);
                lookAtPos.y += 1;
            }
            break;

        case 'busProfile':
            if (busModel) {
                let offset = cameraStates.busProfile.offset;
                targetPos.set(busModel.position.x + offset.x, busModel.position.y + offset.y, busModel.position.z + offset.z);
                lookAtPos.copy(busModel.position);
                lookAtPos.y += 1;
            }
            break;

        case 'carFront':
            if (model) {
                let offset = cameraStates.carFront.offset;
                targetPos.set(model.position.x + offset.x, model.position.y + offset.y, model.position.z + offset.z);
                lookAtPos.copy(model.position);
                lookAtPos.y += 1;
            }
            break;

        case 'busFront':
            if (busModel) {
                let offset = cameraStates.busFront.offset;
                targetPos.set(busModel.position.x + offset.x, busModel.position.y + offset.y, busModel.position.z + offset.z);
                lookAtPos.copy(busModel.position);
                lookAtPos.y += 1;
            }
            break;

        case 'topView':
            // Vue du dessus centrée entre les deux véhicules
            if (model && busModel) {
                let midPoint = new THREE.Vector3();
                midPoint.addVectors(model.position, busModel.position).multiplyScalar(0.5);
                targetPos.set(midPoint.x, midPoint.y + cameraStates.topView.height, midPoint.z);
                lookAtPos.copy(midPoint);
            } else {
                // Si collision déjà passée, on regarde le centre
                targetPos.set(0, cameraStates.topView.height, 0);
                lookAtPos.set(0, 0, 0);
            }
            break;
    }

    // Interpolation douce de la caméra
    camera.position.lerp(targetPos, 1 - Math.exp(-dt * 3));

    // Mise à jour du lookAt
    let currentLookAt = new THREE.Vector3(0, 0, -1);
    currentLookAt.applyQuaternion(camera.quaternion);
    currentLookAt.add(camera.position);
    currentLookAt.lerp(lookAtPos, 1 - Math.exp(-dt * 3));
    camera.lookAt(currentLookAt);
}

// Attendre l'appui sur la touche "1" pour démarrer la scène et le mode cinématique
window.addEventListener('keydown', (e) => {
    if (e.key === '1') {
        // Démarrer la scène si ce n'est pas déjà fait
        if (!sceneStarted) {
            sceneStarted = true;
            startScreen.classList.add('hidden');
            canvas.classList.add('visible');
            console.log('Scène lancée !');

            // Lancer la musique
            if (sound.buffer && !sound.isPlaying) {
                sound.play();
            }
        }

        // Démarrer le mode cinématique si pas encore démarré
        if (!cinematicMode) {
            cinematicMode = true;
            cinematicStartTime = performance.now() / 1000;
            console.log('Séquence cinématique démarrée !');
        }
    }
});

// ===== SYSTÈME D'EXPLOSION DE TRIANGLES =====
let explosionTriangles = [];
let explosionActive = false;
let collisionOccurred = false;

function createExplosionFromModel(modelObj, color = 0xff6600, count = 300) {
    let triangles = [];

    modelObj.traverse((child) => {
        if (child.isMesh && child.geometry) {
            let geo = child.geometry;
            let nonIndexed = geo.index ? geo.toNonIndexed() : geo;
            let pos = nonIndexed.attributes.position.array;
            let worldMatrix = child.matrixWorld.clone();

            let triCount = Math.floor(pos.length / 9);
            let step = Math.max(1, Math.floor(triCount / (count / 2)));

            for (let t = 0; t < triCount && triangles.length < count; t += step) {
                let i = t * 9;
                let v0 = new THREE.Vector3(pos[i + 0], pos[i + 1], pos[i + 2]).applyMatrix4(worldMatrix);
                let v1 = new THREE.Vector3(pos[i + 3], pos[i + 4], pos[i + 5]).applyMatrix4(worldMatrix);
                let v2 = new THREE.Vector3(pos[i + 6], pos[i + 7], pos[i + 8]).applyMatrix4(worldMatrix);

                let center = new THREE.Vector3()
                    .addVectors(v0, v1)
                    .add(v2)
                    .multiplyScalar(1 / 3);

                v0.sub(center);
                v1.sub(center);
                v2.sub(center);

                let triGeo = new THREE.BufferGeometry().setFromPoints([v0, v1, v2]);
                let triMat = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 1.0,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });

                let triMesh = new THREE.Mesh(triGeo, triMat);
                triMesh.position.copy(center);

                // Vélocité radiale depuis le point d'impact
                let vel = new THREE.Vector3(
                    (Math.random() - 0.5) * 30,
                    Math.random() * 25 + 10,
                    (Math.random() - 0.5) * 30
                );

                let angVel = new THREE.Vector3(
                    (Math.random() - 0.5) * 8,
                    (Math.random() - 0.5) * 8,
                    (Math.random() - 0.5) * 8
                );

                triangles.push({
                    mesh: triMesh,
                    velocity: vel,
                    angularVel: angVel,
                    age: 0,
                    life: 3.0 + Math.random() * 2.0
                });

                scene.add(triMesh);
            }
        }
    });

    return triangles;
}

function updateExplosionTriangles(dt) {
    if (!explosionActive) return;

    for (let i = explosionTriangles.length - 1; i >= 0; i--) {
        let tri = explosionTriangles[i];
        tri.age += dt;

        // Physique simple
        tri.velocity.y -= 15 * dt; // gravité
        tri.mesh.position.addScaledVector(tri.velocity, dt);

        // Rotation
        tri.mesh.rotation.x += tri.angularVel.x * dt;
        tri.mesh.rotation.y += tri.angularVel.y * dt;
        tri.mesh.rotation.z += tri.angularVel.z * dt;

        // Fade out
        let fadeRatio = tri.age / tri.life;
        tri.mesh.material.opacity = 1.0 - fadeRatio;

        // Supprimer si terminé
        if (tri.age >= tri.life) {
            scene.remove(tri.mesh);
            tri.mesh.geometry.dispose();
            tri.mesh.material.dispose();
            explosionTriangles.splice(i, 1);
        }
    }
}

function triggerCollisionExplosion() {
    if (collisionOccurred) return;
    collisionOccurred = true;
    explosionActive = true;

    // Créer l'explosion depuis les deux modèles
    if (model) {
        let carTriangles = createExplosionFromModel(model, 0x3366ff, 250);
        explosionTriangles.push(...carTriangles);
        scene.remove(model);
    }

    if (busModel) {
        let busTriangles = createExplosionFromModel(busModel, 0xffaa33, 250);
        explosionTriangles.push(...busTriangles);
        scene.remove(busModel);
    }
}

// Fonction pour créer un téléphone
function createPhone() {
    let group = new THREE.Group();

    // Corps du téléphone
    let bodyGeo = new THREE.BoxGeometry(0.07, 0.14, 0.008);
    let bodyMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.8 });
    let body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    // Écran
    let screenGeo = new THREE.PlaneGeometry(0.065, 0.13);
    let screenMat = new THREE.MeshBasicMaterial({ color: 0x000000 }); // Éteint par défaut
    let screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.z = 0.0041; // Légèrement devant le corps
    group.add(screen);

    return { group, screenMat };
}

let phoneObj = null;
let phoneScreenMat = null;

function animate(ts) {
    // Delta temps robuste (fallback 1/60s sur la 1ère frame)
    let dt = 1 / 60;
    if (typeof ts === 'number') {
        if (lastTs) dt = Math.min(0.05, (ts - lastTs) / 1000);
        lastTs = ts;
    }

    // Ne rien faire si la scène n'a pas démarré
    if (!sceneStarted) {
        renderer.render(scene, camera);
        return;
    }

    // Clignotement sirènes
    let t = (ts || 0) / 1000;
    let phase = Math.floor(t * 4) % 2; // ~4 Hz
    // Lumière plus intense
    let on = 12.0,
        off = 0.0;
    if (sirenLightR && sirenLightB) {
        if (phase === 0) {
            sirenLightR.intensity = on;
            sirenLightB.intensity = off;
            if (sirenTriMatR) sirenTriMatR.opacity = 1.0;
            if (sirenTriMatB) sirenTriMatB.opacity = 0.02;
        } else {
            sirenLightR.intensity = off;
            sirenLightB.intensity = on;
            if (sirenTriMatR) sirenTriMatR.opacity = 0.02;
            if (sirenTriMatB) sirenTriMatB.opacity = 1.0;
        }
    }

    // Gestion du mode cinématique
    if (cinematicMode) {
        updateCinematicCamera(dt);

        // Mouvement automatique synchronisé des véhicules
        if (model && !collisionOccurred) {
            // La voiture avance vers -Z
            model.position.z -= carSpeed * dt;
        }

        if (busModel && !collisionOccurred) {
            // Le bus avance vers +Z (contre-sens) 
            busModel.position.z += carSpeed * dt * 0.9; // légèrement plus lent
        }

        // Détection de collision entre les deux véhicules
        if (model && busModel && !collisionOccurred) {
            let distance = model.position.distanceTo(busModel.position);
            if (distance < 4.0) {
                triggerCollisionExplosion();
            }
        }

        // Mise à jour des triangles d'explosion
        updateExplosionTriangles(dt);

    } else {
        // Mode normal: contrôle manuel de la voiture
        if (model) {
            // mise à jour steering
            steer = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
            // avance vers -Z (sens de la route) + latéral en X
            model.position.z -= carSpeed * dt;
            model.position.x += steer * lateralSpeed * dt;
            // clamp latéral dans la route
            let half = ROAD_WIDTH * 0.5 - 0.8;
            if (model.position.x < -half) model.position.x = -half;
            if (model.position.x > half) model.position.x = half;
            // boucle le long de la route
            let margin = 5;
            if (model.position.z < -ROAD_LENGTH * 0.5 + margin) {
                model.position.z = ROAD_LENGTH * 0.5 - margin;
            }

            // Caméra suiveuse simple: derrière (z+12) et au-dessus
            let desired = new THREE.Vector3(model.position.x, model.position.y + 3.5, model.position.z + 12);
            camera.position.lerp(desired, 1 - Math.exp(-dt * 4));
            camera.lookAt(model.position.x, model.position.y + 0.8, model.position.z);
        }
    }

    // rendu
    renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);