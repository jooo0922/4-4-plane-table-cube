"use strict";

let gl,
  canvas,
  shaderProgram,
  floorVertexPositionBuffer, // 바닥을 그릴 때 사용할 버텍스 위치 데이터 WebGLBuffer를 담을 변수
  floorVertexIndexBuffer, // 바닥을 그릴 때, gl.drawElements()가 사용할 인덱스가 담긴 엘레먼트 배열 버퍼와 바인딩된 WebGLBuffer를 담을 변수.
  cubeVertexPositionBuffer, // 큐브를 그릴 때 버텍스 위치 데이터 WebGLBuffer를 담을 변수. 큐브, 테이블 윗면, 다리 등을 그릴 때 사용하겠군.
  cubeVertexIndexBuffer, // 큐브를 그릴 때, gl.drawElements()가 사용할 인덱스가 담긴 엘레먼트 배열 버퍼와 바인딩된 WebGLBuffer를 담을 변수.
  modelViewMatrix, // 모델뷰 행렬을 glMatrix로 만든 뒤 담아놓을 변수
  projectionMatrix, // 투영 행렬을 glMatrix로 만든 뒤 담아놓을 변수
  modelViewMatrixStack; // drawTable() 함수에서 테이블을 그릴 때, 변환 전의 모델뷰 행렬을 복사하여 저장해놨다가(push) 꺼내쓰는(pop), stack 처럼 사용할 배열을 담는 변수

function createGLContext(canvas) {
  const names = ["webgl", "experimental-webgl"];
  let context = null;

  for (let i = 0; i < names.length; i++) {
    try {
      context = canvas.getContext(names[i]);
    } catch (error) {}

    if (context) {
      break;
    }
  }

  if (context) {
  } else {
    alert("Failed to create WebGL context!");
  }

  return context;
}

function loadShaderFromDOM(id) {
  const shaderScript = document.getElementById(id);

  if (!shaderScript) {
    return null;
  }

  let shaderSource = "";
  let currentChild = shaderScript.firstChild;
  while (currentChild) {
    if (currentChild.nodeType === 3) {
      // currentChild.nodeType === 3 인지를 체크하는 것은, currentChild가 TEXT_NODE 인지를 확인하려는 것!
      shaderSource += currentChild.textContent;
    }
    // if block에서 문자열을 결합해준 뒤, 그 다음 형제노드를 currentChild에 넣어서 다음 반복문으로 넘어가려는 것
    // -> But, 형제 노드가 더 이상 없으므로, 이 반복문은 한 번만 돌고 끝나게 됨.
    currentChild = currentChild.nextSibling;
  }

  let shader;
  if (shaderScript.type === "x-shader/x-fragment") {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type === "x-shader/x-vertex") {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    return null;
  }

  gl.shaderSource(shader, shaderSource);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  }

  return shader;
}

function setupShaders() {
  const vertexShader = loadShaderFromDOM("shader-vs");
  const fragmentShader = loadShaderFromDOM("shader-fs");

  shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert("Failed to setup shaders");
  }

  gl.useProgram(shaderProgram);

  // gl.getAttribLocation()을 이용해서 특정 변수의 제네릭 애트리뷰트 인덱스를 받아오는 과정을 정리한 내용이 3-2 예제 코딩에 정리되어 있음. 참고할 것.
  shaderProgram.vertexPositionAttribute = gl.getAttribLocation(
    shaderProgram,
    "aVertexPosition"
  );
  shaderProgram.vertexColorAttribute = gl.getAttribLocation(
    shaderProgram,
    "aVertexColor"
  ); // 색상 데이터를 기록할 WebGLBuffer 전역 변수들을 따로 마련해놓지 않은 것으로 보아 상수 버텍스(색상) 데이터를 쏴줄 것 같군.
  shaderProgram.uniformMVMatrix = gl.getUniformLocation(
    shaderProgram,
    "uMVMatrix"
  );
  shaderProgram.uniformProjMatrix = gl.getUniformLocation(
    shaderProgram,
    "uPMatrix"
  );

  gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute); // 일단 aVertexPosition 변수만 활성화를 해줌. -> '버텍스 배열'에서 데이터를 받아야 하니까!
  // aVertexColor 변수는 활성화하지 않는 걸 보니 상수 버텍스 데이터를 사용하는 게 확실하군.

  modelViewMatrix = mat4.create(); // 모델뷰 행렬을 만들기 위해 빈 4*4 행렬을 할당.
  projectionMatrix = mat4.create(); // 투영 행렬을 만들기 위해 빈 4*4 행렬을 할당.
  modelViewMatrixStack = []; // 모델뷰 행렬을 push / pop 할 때, stack처럼 사용할 배열을 만들어놓음.
}

function setupFloorBuffers() {
  // gl.drawElements()로 바닥을 그릴 때 사용할 버텍스 위치 데이터 WebGLBuffer 생성
  floorVertexPositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, floorVertexPositionBuffer); // gl.bufferData로 바이너리 데이터를 어떤 WebGLBuffer에 기록할건지 바인딩해줌. (3-2 에서 gl.bindBuffer 관련 정리 참고)

  const floorVertexPosition = [
    // y좌표값(높이)가 0인 4개의 버텍스 좌표를 기록해 둠. (이거를 삼각형 팬 형태로 연결하면 사각형 floor가 됨.)
    // XZ 방향으로 -5.0 ~ 5.0 의 좌표를 가지므로 한 변의 길이가 10이 되겠군.
    5.0,
    0.0,
    5.0, //v0
    5.0,
    0.0,
    -5.0, //v1
    -5.0,
    0.0,
    -5.0, //v2
    -5.0,
    0.0,
    5.0, // v3
  ]; // 버텍스 셰이더에서 투영 변환을 해주므로, 굳이 버텍스 데이터를 클립좌표로 안넣어도 됨. (하단 정리 참고)

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(floorVertexPosition), // 위에 버텍스 좌표 배열에는 실수값만 들어가니 Float32Array로 뷰타입을 생성해야겠지!
    gl.STATIC_DRAW
  );

  floorVertexPositionBuffer.itemSize = 3; // 버텍스 하나 당 필요한 좌표값 수 (gl.vertexAttribPointer()에 사용)
  floorVertexPositionBuffer.numberOfItems = 4; // 총 버텍스 수 (얘는 사용할 일이 없음.. gl.drawElements() 에서는 floorVertexIndexBuffer.numberOfItems, 즉 인덱스 개수를 사용하기 때문.)

  // gl.drawElements()로 바닥을 그릴 때 사용할 버텍스 인덱스를 기록할 WebGLBuffer 생성
  floorVertexIndexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, floorVertexIndexBuffer); // gl.bufferData로 바이너리 데이터를 어떤 WebGLBuffer에 기록할건지 바인딩해줌.
  const floorVertexIndices = [0, 1, 2, 3];

  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(floorVertexIndices), // 위에 인덱스 배열에는 정수값만 들어가니 Uint16Array로 뷰타입을 생성해야겠지!
    gl.STATIC_DRAW
  );

  floorVertexIndexBuffer.itemSize = 1; // 버텍스 하나를 가리키는 인덱스 수겠지? 근데 딱히 예제에서 사용하는 값은 아님.
  floorVertexIndexBuffer.numberOfItems = 4; // 총 인덱스 수 (gl.drawElements() 에서 인덱스 개수로 사용함.)
}

function setupCubeBuffers() {
  // gl.drawElements()로 큐브를 그릴 때 사용할 버텍스 위치 데이터 WebGLBuffer 생성
  cubeVertexPositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexPositionBuffer); // gl.bufferData를 이용해 어떤 WebGLBuffer에 기록할건지 바인딩함.

  const cubeVertexPosition = [
    // Front face
    1.0,
    1.0,
    1.0, //v0
    -1.0,
    1.0,
    1.0, //v1
    -1.0,
    -1.0,
    1.0, //v2
    1.0,
    -1.0,
    1.0, //v3

    // Back face
    1.0,
    1.0,
    -1.0, //v4
    -1.0,
    1.0,
    -1.0, //v5
    -1.0,
    -1.0,
    -1.0, //v6
    1.0,
    -1.0,
    -1.0, //v7

    // Left face
    -1.0,
    1.0,
    1.0, //v8
    -1.0,
    1.0,
    -1.0, //v9
    -1.0,
    -1.0,
    -1.0, //v10
    -1.0,
    -1.0,
    1.0, //v11

    // Right face
    1.0,
    1.0,
    1.0, //12
    1.0,
    -1.0,
    1.0, //13
    1.0,
    -1.0,
    -1.0, //14
    1.0,
    1.0,
    -1.0, //15

    // Top face
    1.0,
    1.0,
    1.0, //v16
    1.0,
    1.0,
    -1.0, //v17
    -1.0,
    1.0,
    -1.0, //v18
    -1.0,
    1.0,
    1.0, //v19

    // Bottom face
    1.0,
    -1.0,
    1.0, //v20
    1.0,
    -1.0,
    -1.0, //v21
    -1.0,
    -1.0,
    -1.0, //v22
    -1.0,
    -1.0,
    1.0, //v23
  ]; // -1.0 ~ 1.0 사이의 좌표값을 가지는 것으로 보아, scaling을 하지 않는 경우, 큐브의 각 변의 길이는 2겠군 (이거 클립좌표로 넣은 거 아님!!)

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(cubeVertexPosition), // 위에 버텍스 좌표 배열에는 실수값만 들어가니 Float32Array로 뷰타입을 생성해야겠지!
    gl.STATIC_DRAW
  );

  cubeVertexPositionBuffer.itemSize = 3; // 버텍스 하나 당 필요한 좌표값 수 (gl.vertexAttribPointer()에 사용)
  cubeVertexPositionBuffer.numberOfItems = 24; // 총 버텍스 수 (마찬가지로 gl.drawElements() 로 그릴 때는 이 값을 사용할 일이 없음..). 근데 왜 24개씩이나 필요할까? 하단 정리 참고.

  // gl.drawElements()로 큐브를 그릴 때 사용할 버텍스 인덱스를 기록할 WebGLBuffer 생성
  cubeVertexIndexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeVertexIndexBuffer); // gl.bufferData를 이용해 어떤 WebGLBuffer에 기록할건지 바인딩함.

  const cubeVertexIndices = [
    0,
    1,
    2,
    0,
    2,
    3, // Front face
    4,
    6,
    5,
    4,
    7,
    6, // Back face
    8,
    9,
    10,
    8,
    10,
    11, // Left face
    12,
    13,
    14,
    12,
    14,
    15, // Right face
    16,
    17,
    18,
    16,
    18,
    19, // Top face
    20,
    22,
    21,
    20,
    23,
    22, // Bottom face
  ]; // gl.TRIANGLES(독립 삼각형)으로 큐브를 그릴 것이니, 면 하나 당 6개 버텍스가 필요하고, 총 36개 버텍스가 필요함.

  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(cubeVertexIndices), // 위에 인덱스 배열에는 정수값만 들어가니 Uint16Array로 뷰타입을 생성해야겠지!
    gl.STATIC_DRAW
  );

  cubeVertexIndexBuffer.itemSize = 1;
  cubeVertexIndexBuffer.numberOfItems = 36; // 총 인덱스 수 (gl.drawElements() 에서 인덱스 개수로 사용함.)
}

function setupBuffers() {
  // floor와 cube에 필요한 WebGLBuffer들을 각각의 함수에서 따로 생성함. (코드가 길어져서 나눠놓은 듯...)
  setupFloorBuffers();
  setupCubeBuffers();
}

function uploadModelViewMatrixToShader() {
  gl.uniformMatrix4fv(shaderProgram.uniformMVMatrix, false, modelViewMatrix); // gl.uniformMatrix4fv() 메서드로 버텍스 셰이더의 uMVMatrix 에 modelViewMatrix를 업로드함.
}

function uploadProjectionMatrixToShader() {
  gl.uniformMatrix4fv(shaderProgram.uniformProjMatrix, false, projectionMatrix); // gl.uniformMatrix4fv() 메서드로 버텍스 셰이더의 uPMatrix 에 projectionMatrix를 업로드함.
}

function pushModelViewMatrix() {
  // 현재의 모델뷰 행렬의 원본을 복사한 뒤, 마치 스택에 저장하는 것처럼 modelViewMatrixStack에 push 해놓는 함수. -> Immutability 를 준수한 코딩이군.
  const copyToPush = mat4.create(modelViewMatrix);
  modelViewMatrixStack.push(copyToPush);
}

function popModelViewMatrix() {
  // 스택에 가장 마지막으로(가장 최근에) 저장된 모델뷰 행렬을 pop 시켜서 리턴받음. 이 때, pop()으로 리턴된 item(모델뷰 행렬)은 배열에서 제거됨.
  if (modelViewMatrixStack.length === 0) {
    // 만약 저장된 모델뷰 행렬의 복사본이 없다면, 에러 메시지를 생성하고 프로그램을 중단함. -> why? throw 연산자는 try...catch 블록 내에서 사용되지 않으면 예외 발생 시 스크립트가 죽어버림.
    throw "Error popModelViewMatrix() - Stack was empty";
  }

  // 가장 마지막에 저장된 모델뷰 행렬을 현재의 모델뷰 행렬로 복구시킴.
  modelViewMatrix = modelViewMatrixStack.pop(); // 저장할 때 push()로 배열 마지막 부분에 추가했으니, 꺼낼 때도 pop()으로 배열 마지막 부분에서 꺼내와야 함.
}

function drawFloor(r, g, b, a) {
  // 인자로 받은 색상값을 이용해서 상수 버텍스 데이터로 색상 데이터를 전달할 것이기 때문에, aVertexColor의 제네릭 애트리뷰트 인덱스를 비활성화함. 3-2 관련 내용 정리 참고.
  gl.disableVertexAttribArray(shaderProgram.vertexColorAttribute);
  gl.vertexAttrib4f(shaderProgram.vertexColorAttribute, r, g, b, a); // 인자로 받은 색상값을 gl.vertexAttrib4f()에 넣어서 버텍스 셰이더에 전달하고자 하는 상수 데이터를 만듦.

  gl.bindBuffer(gl.ARRAY_BUFFER, floorVertexPositionBuffer); // gl.vertexAttribPointer()로 어떤 WebGLBuffer에서 버텍스 데이터를 가져갈건지 정하기 위한 버퍼 바인딩.
  gl.vertexAttribPointer(
    shaderProgram.vertexPositionAttribute,
    floorVertexPositionBuffer.itemSize,
    gl.FLOAT,
    false,
    0,
    0
  ); // floorVertexPositionBuffer에 기록된 버텍스 데이터를 aVertexPosition으로 가져올 방법을 정의함. 각 인자는 2-2 예제 코드 정리 참고

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, floorVertexIndexBuffer); // gl.drawElements() 메서드가 엘레먼트 배열 버퍼를 사용하려면, 먼저 해당 WebGLBuffer를 바인딩해줘야 함. p.158 코드 참고.
  gl.drawElements(
    gl.TRIANGLE_FAN,
    floorVertexIndexBuffer.numberOfItems,
    gl.UNSIGNED_SHORT, // 이거는 엘레먼트 배열 버퍼에 저장된 요소 인덱스의 타입을 지정하는 거라고 함. p.140 참고
    0
  );
}

function drawCube(r, g, b, a) {
  // 인자로 받은 색상값을 이용해서 상수 버텍스 데이터로 색상 데이터를 전달할 것이기 때문에, aVertexColor의 제네릭 애트리뷰트 인덱스를 비활성화함. 3-2 관련 내용 정리 참고.
  gl.disableVertexAttribArray(shaderProgram.vertexColorAttribute);
  gl.vertexAttrib4f(shaderProgram.vertexColorAttribute, r, g, b, a); // 인자로 받은 색상값을 gl.vertexAttrib4f()에 넣어서 버텍스 셰이더에 전달하고자 하는 상수 데이터를 만듦.

  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexPositionBuffer); // gl.vertexAttribPointer()로 어떤 WebGLBuffer에서 버텍스 데이터를 가져갈건지 정하기 위한 버퍼 바인딩.
  gl.vertexAttribPointer(
    shaderProgram.vertexPositionAttribute,
    cubeVertexPositionBuffer.itemSize,
    gl.FLOAT,
    false,
    0,
    0
  ); // floorVertexPositionBuffer에 기록된 버텍스 데이터를 aVertexPosition으로 가져올 방법을 정의함. 각 인자는 2-2 예제 코드 정리 참고

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeVertexIndexBuffer); // gl.drawElements() 메서드가 엘레먼트 배열 버퍼를 사용하려면, 먼저 해당 WebGLBuffer를 바인딩해줘야 함. p.158 코드 참고.
  gl.drawElements(
    gl.TRIANGLE_FAN,
    cubeVertexIndexBuffer.numberOfItems,
    gl.UNSIGNED_SHORT, // 이거는 엘레먼트 배열 버퍼에 저장된 요소 인덱스의 타입을 지정하는 거라고 함. p.140 참고
    0
  );
}

function drawTable() {
  // 테이블 윗면을 그려줌
  pushModelViewMatrix(); // draw() 함수에서 y축으로 1.1만큼 이동시킨 현재의 모델뷰 행렬을 복사하여 저장해놓음. -> 이 값은 drawTable() 에서만 초기값으로 사용할거임!
  mat4.translate(modelViewMatrix, [0.0, 1.0, 0.0], modelViewMatrix); // 윗면을 그려줘야 하니까 y축으로 1.0만큼 더 올린 이동 변환 적용
  mat4.scale(modelViewMatrix, [2.0, 0.1, 2.0], modelViewMatrix); // 테이블 윗면은 얇으면서 넓은 모양이므로, XZ축 기준 2배, Y축 기준 0.1배한 스케일링 변환 적용
  uploadModelViewMatrixToShader(); // 모델뷰 행렬이 바뀌면 항상 버텍스 셰이더에 업로드를 해줘야 함.
  drawCube(0.72, 0.53, 0.04, 1.0); // drawFloor() 처럼 인자로 넣은 색상값(brown)로 상수 버텍스 데이터를 만든 뒤, 그 색상값으로 큐브를 그리는 함수.
  // 이 때, drawCube() 함수는 호출하기 전에 modelViewMatrix가 매번 달라지므로, 그려지는 큐브의 모양, 위치, 크기가 전부 달라짐.
  popModelViewMatrix(); // 가장 마지막에 저장했던 모델뷰 행렬(draw() 함수에서 y축으로 1.1만큼 이동시킨 거)이 복구됨.

  // 테이블 다리 4개를 이중 for문으로 그려줌.
  for (let i = -1; i <= 1; i += 2) {
    for (let j = -1; j <= 1; j += 2) {
      pushModelViewMatrix(); // 현재의 모델뷰 행렬(draw() 함수에서 y축으로 1.1만큼 이동시킨 거)을 복사 및 저장해놓음.
      mat4.translate(
        modelViewMatrix,
        [i * 1.9, -0.1, j * 1.9],
        modelViewMatrix
      ); // 각 다리의 버텍스들을 y축으로 -0.1만큼 내리고, XZ축을 기준으로 -1.9 ~ 1.9 사이의 좌표값을 지정하도록 이동 변환 적용. -> 다리 사이의 거리가 대략 3.8이겠군. -> 테이블 윗면을 XZ축 기준 2배씩 늘렸으니, 다리 사이의 거리도 그만큼 떨군거지
      mat4.scale(modelViewMatrix, [0.1, 1.0, 0.1], modelViewMatrix); // y축으로 길쭉한 모양이 되도록 XZ축 기준으로 0.1배 스케일링 변환 적용.
      uploadModelViewMatrixToShader(); // 모델뷰 행렬이 바뀌면 항상 버텍스 셰이더에 업로드.
      drawCube(0.72, 0.53, 0.04, 1.0); // brown 컬러를 상수 버텍스 데이터로 만든 뒤, 큐브를 그리도록 함.
      popModelViewMatrix(); // 다음 반복문으로 넘어가서 새로운 다리를 그려주기 전에, 현재의 모델뷰 행렬을 push해놓은 행렬(draw() 함수에서 y축으로 1.1만큼 이동시킨 거)로 복구함.
    }
  }
  // 여기서 기억할 점은, 마지막 반복문에서 마지막 다리를 그려준 뒤, popModelViewMatrix(); 해버리게 되면,
  // 현재의 모델뷰 행렬은 draw() 함수에서 y축으로 1.1만큼 이동시킨 모델뷰 행렬로 복구되고, 스택에는 카메라의 뷰 변환만 적용된 모델뷰 행렬만 남게 됨.
}

function draw() {
  // primitive assembly 단계에서 원근 분할을 거쳐 NDC 좌표로 변환시키고 나면, 뷰포트 변환 단계를 거치면서 윈도우 좌표계로 변환이 되는데,
  // 이 때, gl.viewport() 메서드를 이용하여 이 뷰포트 변환의 결과값에 영향을 줄 수 있음. p.212 관련 내용 참고
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  // gl.clear() 메서드는 비트연산자(|)를 이용해서 여러 개의 GLbitfield 파라미터를 받을 수 있음.
  // 아마 startup() 함수에서 깊이 테스트 기능도 활성화했기 때문에, 프레임을 새로 그릴 때마다 색상 버퍼와 깊이 버퍼 둘 다 초기화해줘야 하기 때문인 것 같음.
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 바닥을 그릴 때 사용할 투영행렬을 만듦.
  mat4.perspective(
    60, // fov
    gl.canvas.width / gl.canvas.height, // aspect (종횡비 = 뷰포트 너비 / 뷰포트 높이)
    0.1, // near
    100.0, // far
    projectionMatrix // 위의 4개 인자로 투영 행렬을 만든 뒤에 결과를 기록할 목적지 인자
  ); // mat4.perspective()로 원근 투영에 필요한 투영행렬을 만듦. Three.js에서 new THREE.PerspectiveCamera() 에 넣어주는 인자값이 동일함!

  // 바닥을 그릴 때 사용할 모델뷰행렬을 만듦.
  mat4.identity(modelViewMatrix); // 모델뷰 행렬을 만들 때는 항상 단위행렬로 초기화부터 먼저 해야 함.
  mat4.lookAt([8, 5, -10], [0, 0, 0], [0, 1, 0], modelViewMatrix); // 단위행렬 초기화 후에는 '뷰 변환'을 먼저 해줘야 함. (근데 floor는 모델 변환은 안해주는 듯. 카메라만 움직이겠다는 뜻..)

  // 바닥을 그릴 때 사용할 투영행렬과 모델뷰행렬을 다 만들고 나면, 아래의 두 함수를 호출시켜 버텍스 셰이더로 각각의 행렬들을 쏴줌.
  uploadModelViewMatrixToShader();
  uploadProjectionMatrixToShader();
  drawFloor(1.0, 0.0, 0.0, 1.0); // 인자로 넣은 색상값(red)로 상수 버텍스 데이터를 만든 뒤, 그 색상값으로 바닥을 그리는 함수

  // 테이블 그리기
  // 테이블을 그리기 전, 앞에서 만든 모델뷰 행렬(카메라의 뷰 변환만 적용됨)을 복사하여 저장해 둠. -> drawTable() 함수에서 다시 꺼내 쓸거임.
  // 왜 이 값을 초기값으로 저장해놓았냐면, 해당 모델뷰 행렬이 카메라의 뷰 변환까지만 적용된 상태이고, 모델 변환에 대해서는 적용이 안되어있으므로,
  // drawTable()로 테이블을 그리기 전, 또는 drawCube()로 큐브를 그리기 전에서 모델 변환만 바꿔서 사용하기 좋기 때문임. 양쪽에서 모두 사용하는 초기값이라고 생각하면 됨.
  pushModelViewMatrix();
  mat4.translate(modelViewMatrix, [0.0, 1.1, 0.0], modelViewMatrix); // 버텍스들을 y축으로 1.1만큼 이동시키는 모델 변환 적용. -> 얘는 'drawTable()에서만' 사용할 초기값!
  uploadModelViewMatrixToShader(); // 모델뷰 행렬이 바뀌면 항상 버텍스 셰이더에 업로드를 해줘야 함.
  drawTable();
  popModelViewMatrix(); // drawTable() 함수의 마지막 부분에 써놓은 필기를 참고하면, 이 부분에서 다시 pop 해줄 때 현재의 모델뷰 행렬은 카메라의 뷰 변환만 적용된 모델뷰 행렬로 다시 복구된다는 걸 알게 됨! -> 이게 아주 중요함!!!

  // 테이블 위 큐브 그리기
  pushModelViewMatrix(); // 위에서도 말했듯이, 현재의 모델뷰 행렬은 카메라의 뷰 변환만 적용된 것이고, 이거를 복사하여 저장해놓음.
  mat4.translate(modelViewMatrix, [0.0, 2.7, 0.0]); // 맨 꼭대기에 위치한 버텍스들이니 y축으로 2.7만큼 올리는 이동 변환 적용.
  mat4.scale(modelViewMatrix, [0.5, 0.5, 0.5], modelViewMatrix); // drawCube() 함수 자체만으로는 모서리가 2인 큐브를 그리는데, scale을 XYZ축 기준 0.5배로 변환 적용하면 모서리가 1인 큐브로 그려지겠군.
  uploadModelViewMatrixToShader(); // 모델뷰 행렬이 바뀌면 항상 버텍스 셰이더에 업로드를 해줘야 써먹을 수 있겠지.
  drawCube(0.0, 0.0, 1.0, 1.0); // blue 컬러를 상수 버텍스 데이터로 만든 뒤, 큐브를 그리도록 함.
  popModelViewMatrix(); // 현재의 모델뷰 행렬을 카메라의 뷰 변환만 적용된 것으로 다시 복구시킴.
}

function startup() {
  canvas = document.getElementById("myGLCanvas");
  gl = WebGLDebugUtils.makeDebugContext(createGLContext(canvas));
  setupShaders();
  setupBuffers();
  gl.clearColor(1.0, 1.0, 1.0, 1.0); // 캔버스의 모든 픽셀을 gl.clear()로 초기화할 때의 색상을 white로 지정함.
  gl.enable(gl.DEPTH_TEST); // 3D 장면을 2D 색상 버퍼에 그릴 때는, 깊이 테스트 기능을 활성화해야 함. 깊이 버퍼의 값에 따라 어떤 픽셀을 그려줄 것인지 결정함. P.46 참고!

  draw();
}

/**
 * gl.getUniformLocation(ShaderProgram, uniform 변수명)
 *
 * gl.getAttribLocation() 과 유사하게
 * 전달된 ShaderProgram 객체 내에서의 특정 uniform 변수의 위치를 리턴해 줌.
 *
 * 이 때, gl.getAttribLocation이 GLint 값으로 제네릭 애트리뷰트 인덱스값을 리턴해주는 것과 달리,
 * 이 메서드는 WebGLUniformLocation 이라는 객체를 리턴해 줌.
 * 콘솔로 찍어보면 리턴값이 다른 걸 알 수 있음.
 *
 * 이 객체는 첫 번째 인자로 전달된 ShaderProgram 객체 내에서
 * 해당 uniform 변수의 위치를 GPU의 메모리 내에서 uniform 변수가 어디에 위치하는지로 지정해 줌.
 *
 * 이 WebGLUniformLocation 객체는 나중에
 * gl.uniformMatrix4fv() 메서드를 이용해 자바스크립트로 만든 변환 행렬을
 * GPU의 버텍스 셰이더로 업로드할 때 사용됨.
 *
 * 참고로, WebGLUniformLocation 객체는 opaque identifier에 해당함.
 * 즉, 자세한 내부 구조를 노출시키지 않는 객체라는 뜻.
 * 실제로 콘솔에 찍어보면 WebGLUniformLocation 객체만 나오고
 * 그 안에 구체적으로 어떤 값이나 프로퍼티가 제대로 안나옴.
 */

/**
 * 더 이상 버텍스 데이터(오브젝트 좌표)를 -1.0 ~ 1.0 사이의 값으로 할 필요가 없는 이유
 *
 * 이전 예제까지는 버텍스 셰이더에서 어떤 변환도 적용하지 않고,
 * WebGLBuffer에서 가져온 데이터를 썡으로 gl_Position에 넣어줬기 때문에
 * 처음부터 버텍스 데이터 배열을 만들 때, -1.0 ~ 1.0 사이의 클립 좌표로 만들어줘야 했음.
 *
 * 그러나, 이번 예제부터는 버텍스 셰이더에서 각 버텍스 데이터에
 * uPMatrix 즉, 투영 행렬을 곱해서 클리핑된 좌표로 변환한 뒤에 gl_Position에 넣어주기 때문에
 * -1.0 ~ 1.0 범위를 넘어선 값을 사용하더라도 알아서 투영 변환을 해준다는거임.
 *
 * 관련 내용은 다음 페이지를 참고
 * -투영 변환: p.208 ~ 211
 * -오브젝트 좌표와 클립 좌표를 일치시키지 않아도 되는 이유: p.215
 */

/**
 * 큐브를 24개의 버텍스 데이터로 그리는 이유?
 *
 * gl.TRIALGLES(독립삼각형)과 gl.drawElements() 로 그린다고 하더라도,
 * 큐브는 사실상 8개의 버텍스 데이터 만으로도 충분히 그릴 수 있음.
 *
 * 그런데 굳이 중복되는 좌표값을 포함해서 24개의 버텍스 데이터로 그리는 이유는
 * 큐브의 각 면마다 서로 다른 색상을 적용해주고 싶다면? 큐브의 각 면마다 서로 다른 노멀이 필요하다면?
 *
 * 8개의 버텍스로 큐브를 그릴 경우, 각 버텍스는 3개의 면에 의해 공유되므로,
 * 3개의 면은 하나의 버텍스에 저장된 색상 및 노멀 데이터만 사용할 수밖에 없음
 * -> 이렇게 하면 같은 버텍스를 공유하는 3개의 면은 서로 다른 색상이나 노멀을 적용해줄 수 없음.
 *
 * 따라서, 각 면당 색상을 달리하거나 노멀이 필요하다면,
 * 꼭지점마다 3개의 중복되는 버텍스 데이터가 필요함.
 * 이러면 같은 꼭지점에 위치하더라도, 색상 및 노멀을 3개의 버텍스 데이터에 각각 저장해줄 수 있음!
 * 그래서 8 * 3 = 24개의 버텍스 데이터로 그림을 그렸던 것!
 *
 * 물론 이 예제에서는 상수 버텍스 데이터로 큐브의 각 면에 똑같은 색상을 적용해주지만
 * 확장성을 염두에 두고 버텍스를 구분하여 그려놓은 것임.
 *
 * 관련 내용 p.232 참고
 */

/**
 * 모델뷰 행렬을 만드는 순서
 *
 * 1. 단위행렬로 초기화
 * -먼저 modelViewMatrix = mat4.create(); 이런 식으로 glMatrix를 이용해서 비어있는 4*4 행렬을 만들어 놓아야 함.
 * -그 다음 mat4.identity(modelViewMatrix); 이렇게 비어있는 4*4 행렬을 단위행렬로 초기화해줌.
 * -mat4.identity(4*4 행렬) 해주면 인자로 넣어준 행렬을 단위행렬로 만들어 줌.
 * -단위행렬로 초기화를 안해주면 이전 프레임에서 사용한 모델뷰 행렬값이 그대로 남아있게 됨.
 *
 * 2. 뷰 변환
 * -단위행렬로 초기화된 modelViewMatrix를 가져온 뒤, mat4.lookAt([카메라(관찰자)의 위치], [카메라가 향하는 시점], [up 방향], modelViewMatrix) 으로 뷰 변환을 해줌.
 * -첫 번째 인자는, 카메라 즉, 관찰자의 위치를 좌표값으로 전달해 줌.
 * -두 번째 인자는, 카메라가 향하는 시점의 위치를 좌표값으로 전달해 줌.
 * -세 번째 인자는, 말 그대로 X, Y, Z축 중에서 어디를 up(윗 방향)으로 할 것인지 정하는 것. 윗 방향으로 지정할 좌표만 1(또는 음의 방향일 경우 -1)을 놓고 나머지는 0을 넣음.
 * -어지간하면 양의 y축 방향으로 설정하므로 [0, 1, 0]을 넣어줌.
 * -이 메서드로 뷰 변환이 적용된 행렬을 modelViewMatrix에 반영해 줌.
 *
 * ** 주의!) WebGL에서 카메라는 항상 원점에 위치하며, 음의 Z축을 향하고 있음.
 * 또한 카메라를 이동시키는 메서드가 없음.
 * 그렇다면 카메라의 위치를 설정한다는 게 도대체 무슨 말일까?
 * 예를 들어, 카메라를 z축으로 5만큼 움직이고 싶은데, 카메라는 움직일 수 없다면,
 * 장면에 존재하는 버텍스를 카메라를 이동시키고자 하는 만큼 정확히 반대로 변환하는 것, 즉 버텍스를 z축으로 -5만큼 움직이는거지.
 * 뷰 변환이 실제로 하는 일은 이런 것임. 카메라를 움직이는 게 아니라, 카메라가 움직이려는 방향의 정 반대로 버텍스들을 움직이는 것.
 *
 * 3. 모델 변환
 * -장면에서 오브젝트 생성에 사용하는 버텍스들의 최초 좌표(즉, 오브젝트 좌표)를 '이동, 회전, 스케일'을 조합하여 변환함.
 * -glMatrix 라이브러리의 mat4.translate, mat4.rotate(), mat4.scale() 을 이용해서 모델 변환이 적용된 행렬을 modelViewMatrix에 반영해 줌.
 * -뷰 변환과 달리 버텍스들을 실제로 움직여주는 변환이라고 보면 됨.
 * -항상 뷰 변환 다음에 실행해야 함.
 *
 * 관련 내용 p.205 ~ 207, p.216 ~ 217 참고.
 *
 * -> 왜 이 순서로 해줘야 하냐면,
 * 버텍스 셰이더에서는 각각의 버텍스들에 정확히 이 순서의 반대 순서로 변환을 수행해주기 때문임!
 * 즉, '버텍스 * 모델 변환 -> 버텍스 * 모델 변환 * 뷰 변환'
 * 이렇게 해줌. -> 실제로 고정좌표계에서는 이렇게 뒤바뀐 순서대로 실제 변환이 일어남.
 * 단, 지역좌표계에서는 자바스크립트 코드 순서와 동일하게 변환이 일어남. 관련 내용 p. 220 ~ 223 참고
 */

/**
 * gl.uniformMatrix4fv(WebGLUniformLocation, 행렬 전치 여부, modelViewMatrix 또는 projectionMatrix);
 *
 * gl.uniformMatrix4fv() 메서드는 버텍스 셰이더의 uMVMatrix, uPMatrix 등의
 * 유니폼 변수에 모델뷰 행렬 및 투영 행렬를 업로드할 때 사용함.
 *
 * 1. 이 때, shaderProgram.uniformMVMatrix(또는 uniformProjMatrix) 에는
 * setupShaders() 함수에서 저장한 WebGLUniformLocation 객체가 담겨있음.
 * 얘는 ShaderProgram 내에서 uMVMatrix(또는 uPMatrix)의 위치를 알려줌.
 *
 * 2. 행렬 전치 여부는 뭐냐면,
 * GLSL 즉, 셰이더는 mat4 행렬을 항상 열우선 행렬로 표현해서 사용하기 때문에,
 * 일반적인 선형대수학에서 사용하는 행렬을 전치행렬로(p.70 참고)로 바꿔서 쏴줄 지 결정해야 함.
 * 그러나, glMatrix 라이브러리는 모든 행렬의 연산결과를
 * 'Float32Array 타입의 16개의 원소로 구성된 열우선 행렬'로 표현함!
 *
 * 즉, 행렬을 전치시켜줄 필요가 없겠지! 그래서 glMatrix로 코딩을 한다면
 * 해당 인자는 항상 false로 넣어주면 됨.
 *
 * 3. 마지막 인자는 glMatrix 라이브러리로 만든 모델뷰행렬 및 투영행렬을 전달해 줌.
 * glMatrix는 모든 연산의 결과값이 Float32Array로 리턴되므로,
 * 그냥 modelViewMatrix 또는 projectionMatrix 를 바로 쏴주면 됨.
 */

/**
 * 이 예제에서는 테이블을 구성하는 각 큐브 및 테이블 위의 큐브를
 * 모델뷰 행렬을 변경해가면서 그리기 위해
 * 스택을 활용한 모델뷰 행렬 삽입 삭제 기법을 사용했음.
 *
 * 해당 기법에 의해 모델뷰 행렬과 스택이 어떤 식으로 변하는지는
 * 코드 옆에 코멘트로 상세하게 정리해 놓았으므로,
 * 잘 따라가면서 읽어보면 어떤 흐름으로 바뀌는지 알 수 있을 것임.
 */
