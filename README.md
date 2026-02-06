Simulation Cinématique 3D & Prévention Routière

![Three.js](https://img.shields.io/badge/Three.js-black?style=for-the-badge&logo=three.js&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![WebGL](https://img.shields.io/badge/WebGL-990000?style=for-the-badge&logo=webgl&logoColor=white)

 Projet étudiant - Moteur de Jeu (Semestre 5)
 Une expérience 3D immersive réalisée avec Three.js visant à sensibiliser aux dangers de l'utilisation du téléphone au volant.

Présentation

Ce projet est une scène cinématique en temps réel générée par navigateur. Elle met en scène une course-poursuite policière dramatique aboutissant à un accident, causé par l'inattention d'un conducteur de bus distrait par une notification sur son smartphone.

L'objectif technique était de maîtriser la bibliothèque Three.js, la gestion de caméras cinématiques, l'importation de modèles 3D et la création d'effets visuels procéduraux sans moteur physique lourd.

Fonctionnalités Techniques

   Rendu 3D Temps Réel : Utilisation de `THREE.WebGLRenderer` avec gestion des ombres et lumières.
   Système de Caméra Cinématique : 
       Implémentation d'une `Timeline` scriptée pour changer les plans de caméra dynamiquement (Traveling, Zoom, Vue zénithale).
       Interpolation fluide (Lerp) entre les positions de caméra.
   Génération Procédurale :
       Ville générée dynamiquement (immeubles, routes, trottoirs) autour de l'axe de déplacement.
       Système de particules "Low Poly" pour simuler l'explosion (décomposition des modèles en triangles avec héritage de vélocité).
   Assets & Animation :
       Importation de modèles GLTF/GLB (Bus, Voiture de police).
       Matériaux émissifs animés pour les gyrophares.
       Animation de notification sur l'écran du téléphone 3D.
   Audio Spatiale : Intégration sonore via `THREE.AudioListener`.

Scénario de la Séquence

1.  La Poursuite : Une voiture de police roule à vive allure dans un environnement urbain sombre.
2.  L'Élément Perturbateur : Zoom sur l'intérieur du bus arrivant en sens inverse. Le téléphone du conducteur s'allume (notification).
3.  L'Impact : Collision frontale gérée par un système d'explosion de géométrie.
4.  La Sensibilisation : Inspection des débris suivie d'un écran de prévention animé avec statistiques réelles sur la mortalité routière.

Installation et Lancement

Ce projet nécessite un serveur local pour charger les assets 3D.

Pré-requis
   Python 3 ou Node.js (ou extension VS Code "Live Server")

Instructions

1.  Cloner le dépôt :
    ```bash
    git clone https://github.com/votre-username/prevention-routiere-threejs.git
    cd prevention-routiere-threejs
    ```

2.  Lancer un serveur local :

       Avec Python :
        ```bash
        python3 -m http.server
        ```
       Avec Node/NPM (http-server) :
        ```bash
        npx http-server
        ```

3.  Ouvrir le navigateur à l'adresse indiquée (généralement `http://localhost:8000`).

4.  Appuyez sur la touche `1` pour lancer la cinématique.

Structure du Code

   `index.html` : Interface utilisateur (Overlay de début et de fin, CSS animations).
   `js/policia.js` : Cœur logique de l'application.
       `createExplosionFromModel()` : Algorithme de fragmentation de mesh.
       `updateCinematicCamera()` : Gestionnaire d'états de la caméra.
       Gestion de la scène Three.js (Lumières, Scène, Rendu).
   `assets/` : Modèles 3D (.gltf) et fichiers audio.

Auteur

Mathis - Étudiant en Informatique 
