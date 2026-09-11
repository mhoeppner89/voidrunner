import * as THREE from 'three';

// Finite annulus. Back faces supply one fragment per viewing ray,
// including when the camera is inside. No screen haze or stacked ring sheets.
export function createRingVolume(surface, radius, composite = false) {
    const source = surface.material.uniforms;
    const inverseRotation = surface.quaternion.clone().invert();
    const material = new THREE.ShaderMaterial({
        transparent: true, side: THREE.BackSide, depthWrite: false,
        // Planet occlusion is analytic below; the distant depth buffer cannot
        // reliably distinguish the planet and ring at this game's scale.
        depthTest: false, toneMapped: false,
        uniforms: {
            ringMap: source.uRingMap,
            localCamera: { value: new THREE.Vector3() },
            localSun: { value: source.uSunDirection.value.clone().applyQuaternion(inverseRotation) },
            tint: source.uTint,
        },
        vertexShader: `varying vec3 localPosition;
            void main() {
                localPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
        fragmentShader: `
            uniform sampler2D ringMap;
            uniform vec3 localCamera, localSun, tint;
            varying vec3 localPosition;
            const float H = 0.004;
            const float INNER = 1.3;
            const float OUTER = 2.74;
            void main() {
                vec3 origin = localCamera;
                vec3 direction = normalize(localPosition - origin);
                float enter = 0.0;
                float leave = 100.0;
                // Intersect the finite thickness, including horizontal rays.
                if (abs(direction.z) < 0.000001) {
                    if (abs(origin.z) >= H) discard;
                } else {
                    float a = (-H - origin.z) / direction.z;
                    float b = ( H - origin.z) / direction.z;
                    enter = max(enter, min(a,b));
                    leave = min(leave, max(a,b));
                }
                // Intersect the outer cylinder, bounding horizontal path length.
                float a = dot(direction.xy, direction.xy);
                float b = dot(origin.xy, direction.xy);
                float c = dot(origin.xy, origin.xy) - OUTER * OUTER;
                if (a < 0.000001) {
                    if (c > 0.0) discard;
                } else {
                    float discriminant = b*b - a*c;
                    if (discriminant <= 0.0) discard;
                    float root = sqrt(discriminant);
                    enter = max(enter, (-b-root)/a);
                    leave = min(leave, (-b+root)/a);
                }
                // Stop at the planet surface; never paint across its disc.
                float along = dot(origin, direction);
                vec3 impact = cross(origin, direction);
                float impact2 = dot(impact, impact);
                if (dot(origin,origin) < 1.0) discard;
                if (impact2 < 1.0) {
                    float hit = -along - sqrt(1.0-impact2);
                    if (hit > 0.0) leave = min(leave, hit);
                }
                if (leave <= enter) discard;
                float stepLength = (leave-enter)/16.0;
                vec3 color = vec3(0.0);
                float transmission = 1.0;
                float bright = 0.62 + 0.38*abs(localSun.z);
                for (int i=0; i<16; i++) {
                    vec3 p = origin + direction*(enter+(float(i)+0.5)*stepLength);
                    float t = (length(p.xy)-INNER)/(OUTER-INNER);
                    if (t <= 0.0 || t >= 1.0) continue;
                    vec4 band = texture2D(ringMap, vec2(t,0.5));
                    float edges = smoothstep(0.0,0.035,t)*(1.0-smoothstep(0.955,1.0,t));
                    float vertical = 1.0-smoothstep(0.1*H,H,abs(p.z));
                    // The vertical profile integrates to 1.1*H. Calibrate its
                    // optical depth to the original face-on ring opacity.
                    float tau = -log(max(0.001,1.0-band.a*edges*0.66));
                    float alpha = 1.0-exp(-tau*vertical*stepLength/(1.1*H));
                    float sunAlong = dot(p,localSun);
                    float perp = length(p-localSun*sunAlong);
                    float shadow = mix(0.18,1.0,smoothstep(0.92,1.14,perp));
                    shadow = mix(shadow,1.0,smoothstep(-0.4,1.6,sunAlong));
                    color += transmission*alpha*tint*(0.72+0.5*band.r)*bright*shadow;
                    transmission *= 1.0-alpha;
                    if (transmission < 0.005) break;
                }
                float opacity = 1.0-transmission;
                if (opacity < 0.001) discard;
                gl_FragColor = vec4(color/max(opacity,0.001),opacity);
            }`,
    });
    const viewToRing = new THREE.Matrix4();
    const inverseMatrix = new THREE.Matrix4().makeRotationFromQuaternion(inverseRotation);
    if (composite) {
        Object.assign(material.uniforms, {
            sceneColor: { value: null }, sceneDepth: { value: null },
            cameraNear: { value: 0.08 }, cameraFar: { value: 2000000 },
            planetRadius: { value: radius },
            projectionInverse: { value: new THREE.Matrix4() },
            viewToRing: { value: viewToRing },
        });
        material.transparent = false;
        material.side = THREE.FrontSide;
        material.vertexShader = `
            uniform mat4 projectionInverse, viewToRing;
            uniform vec3 localCamera;
            varying vec3 localPosition;
            varying vec2 screenUv;
            void main() {
                screenUv = position.xy*0.5+0.5;
                vec4 projected = projectionInverse*vec4(position.xy,1.0,1.0);
                vec3 ray = projected.xyz / -projected.z;
                localPosition = localCamera + (viewToRing*vec4(ray,0.0)).xyz;
                gl_Position = vec4(position.xy,0.0,1.0);
            }`;
        material.fragmentShader = `
            uniform sampler2D sceneColor, sceneDepth;
            uniform float cameraNear, cameraFar, planetRadius;
            varying vec2 screenUv;
        ` + material.fragmentShader
            .replace('vec3 origin = localCamera;', `
                vec4 background = texture2D(sceneColor,screenUv);
                gl_FragColor = background;
                vec3 origin = localCamera;`)
            .replace('float leave = 100.0;', `
                float depth = texture2D(sceneDepth,screenUv).x;
                float viewDistance = cameraNear*cameraFar /
                    (cameraFar-depth*(cameraFar-cameraNear));
                float leave = min(100.0,viewDistance*length(localPosition-origin)/planetRadius);`)
            .replaceAll('discard;', 'return;')
            .replace('gl_FragColor = vec4(color/max(opacity,0.001),opacity);',
                'gl_FragColor = vec4(color + background.rgb*transmission, background.a);');
    }
    const mesh = new THREE.Mesh(composite ? new THREE.PlaneGeometry(2,2) : new THREE.BoxGeometry(5.48,5.48,0.008),material);
    mesh.scale.setScalar(radius);
    mesh.quaternion.copy(surface.quaternion);
    mesh.position.copy(source.uPlanetCenter.value);
    mesh.renderOrder = 10;
    mesh.raycast = () => {};
    if (composite) mesh.frustumCulled = false;
    return {
        mesh,
        // Conservative physical bounds, independent of the fullscreen
        // composite quad. Offscreen rings need no depth reads or ray marching.
        bounds: new THREE.Sphere(mesh.position.clone(), radius * 2.741),
        update(cameraPosition, camera, sceneTarget) {
            if (composite) {
                viewToRing.multiplyMatrices(inverseMatrix,camera.matrixWorld);
                material.uniforms.projectionInverse.value.copy(camera.projectionMatrixInverse);
                material.uniforms.cameraNear.value = camera.near;
                material.uniforms.cameraFar.value = camera.far;
                material.uniforms.sceneColor.value = sceneTarget.texture;
                material.uniforms.sceneDepth.value = sceneTarget.depthTexture;
            }
            material.uniforms.localCamera.value.copy(cameraPosition)
                .sub(mesh.position).applyQuaternion(inverseRotation).divideScalar(radius);
        },
    };
}
