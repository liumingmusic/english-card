/* 给小学(PRIMARY)41 词写入高质量双语例句（由人工编写，保证有中文翻译）。
   运行：node scripts/primary-examples.js  → 覆盖 PRIMARY 词的 examples 字段，其余级别不变。 */
const fs = require("fs");
const path = require("path");
const ROOT = __dirname.replace(/\/scripts$/, "");
const DATA = path.join(ROOT, "data", "words.json");

const PRIMARY = {
  apple: [["I eat an apple every day.", "我每天都吃一个苹果。"], ["The apple is red and sweet.", "这个苹果又红又甜。"], ["She put the apple in the basket.", "她把苹果放进了篮子。"]],
  big: [["The elephant is very big.", "大象非常大。"], ["This is a big red ball.", "这是一个红色的大球。"], ["My dog is bigger than yours.", "我的狗比你的狗大。"]],
  bird: [["A small bird is singing in the tree.", "一只小鸟在树上唱歌。"], ["The bird can fly high.", "鸟能飞得很高。"], ["I see a blue bird near the window.", "我看见窗边有一只蓝色的鸟。"]],
  blue: [["The sky is blue today.", "今天天空是蓝色的。"], ["She has a blue schoolbag.", "她有一个蓝色的书包。"], ["I like the blue pen on the desk.", "我喜欢桌上那支蓝色的钢笔。"]],
  book: [["I read a book before sleep.", "我睡觉前读一本书。"], ["This book is very interesting.", "这本书很有趣。"], ["Please open your book to page ten.", "请把书翻到第10页。"]],
  cat: [["The cat is sleeping on the chair.", "猫正睡在椅子上。"], ["My cat likes to play with a ball.", "我的猫喜欢玩球。"], ["A black cat is in the garden.", "花园里有一只黑猫。"]],
  close: [["Please close the door.", "请把门关上。"], ["Close your eyes and listen.", "闭上你的眼睛听。"], ["He closed the window at night.", "他晚上关上了窗户。"]],
  come: [["Come here, little dog!", "过来，小狗！"], ["My friend will come to my home.", "我的朋友会来我家。"], ["Please come with me.", "请和我一起来。"]],
  dog: [["The dog is running after a ball.", "狗正追着一个球跑。"], ["I have a small white dog.", "我有一只白色的小狗。"], ["The dog eats meat every day.", "狗每天都吃肉。"]],
  eat: [["We eat rice for lunch.", "我们午餐吃米饭。"], ["Don't eat too much candy.", "不要吃太多糖。"], ["The boy is eating an apple.", "男孩正在吃苹果。"]],
  family: [["I love my family.", "我爱我的家人。"], ["We have a big family.", "我们有一个大家庭。"], ["Family is very important.", "家庭非常重要。"]],
  fish: [["The fish is swimming in the water.", "鱼在水里游泳。"], ["I eat fish for dinner.", "我晚餐吃鱼。"], ["He caught a big fish.", "他钓到了一条大鱼。"]],
  friend: [["She is my good friend.", "她是我的好朋友。"], ["I play with my friend after school.", "放学后我和朋友一起玩。"], ["We are friends forever.", "我们是永远的朋友。"]],
  go: [["Let's go to school.", "我们去上学吧。"], ["I go home at five.", "我五点回家。"], ["They go to the park on Sunday.", "他们周日去公园。"]],
  good: [["This is a good book.", "这是一本好书。"], ["He is a good student.", "他是一个好学生。"], ["The food is very good.", "食物很好吃。"]],
  green: [["The grass is green.", "草是绿色的。"], ["She wears a green dress.", "她穿着一条绿色的裙子。"], ["I have a green apple.", "我有一个青苹果。"]],
  happy: [["I am happy today.", "我今天很高兴。"], ["The children are happy in the park.", "孩子们在公园里很开心。"], ["She is happy to see her friend.", "她很高兴见到她的朋友。"]],
  hear: [["I hear a bird singing.", "我听见一只鸟在唱歌。"], ["Can you hear the music?", "你能听见音乐吗？"], ["She heard a loud noise.", "她听到一声巨响。"]],
  hello: [["Hello! How are you?", "你好！你好吗？"], ["He said hello to the teacher.", "他跟老师问好。"], ["Say hello to your mother.", "向你妈妈问好。"]],
  help: [["Can you help me, please?", "你能帮我一下吗？"], ["He helps his mother at home.", "他在家帮妈妈。"], ["Thank you for your help.", "谢谢你的帮助。"]],
  look: [["Look at the blackboard.", "看黑板。"], ["She looks happy today.", "她今天看起来很高兴。"], ["Look! A red bird!", "看！一只红色的鸟！"]],
  love: [["I love my family.", "我爱我的家人。"], ["She loves to read books.", "她喜欢读书。"], ["We love our school.", "我们爱我们的学校。"]],
  moon: [["The moon is bright tonight.", "今晚的月亮很亮。"], ["We can see the moon in the sky.", "我们能看见天上的月亮。"], ["A star is next to the moon.", "一颗星星在月亮旁边。"]],
  open: [["Please open the window.", "请打开窗户。"], ["Open your book to page five.", "把书翻到第5页。"], ["He opened the door for me.", "他为我打开了门。"]],
  play: [["The children play in the park.", "孩子们在公园里玩。"], ["I play football after school.", "放学后我踢足球。"], ["She plays the piano every day.", "她每天弹钢琴。"]],
  read: [["I read a story book at night.", "晚上我读故事书。"], ["Can you read this word?", "你能读这个单词吗？"], ["He reads English every morning.", "他每天早上读英语。"]],
  red: [["I have a red apple.", "我有一个红苹果。"], ["She wears a red coat.", "她穿着一件红色的外套。"], ["The red flower is very beautiful.", "这朵红花很漂亮。"]],
  run: [["The dog runs fast.", "狗跑得很快。"], ["Don't run in the classroom.", "别在教室里跑。"], ["He runs to school every morning.", "他每天早上跑步去上学。"]],
  school: [["We go to school by bus.", "我们坐公交去上学。"], ["My school is very big.", "我的学校很大。"], ["The teacher is at school.", "老师在学校。"]],
  see: [["I see a cat under the table.", "我看见桌子下面有一只猫。"], ["Can you see the moon?", "你能看见月亮吗？"], ["I see a red bird in the tree.", "我看见树上有一只红色的鸟。"]],
  sing: [["She likes to sing songs.", "她喜欢唱歌。"], ["The bird sings in the morning.", "鸟在早晨唱歌。"], ["We sing together in class.", "我们在课上一起唱歌。"]],
  small: [["This is a small cat.", "这是一只小猫。"], ["I have a small red ball.", "我有一个红色的小球。"], ["The small dog is very cute.", "这只小狗很可爱。"]],
  star: [["There are many stars in the sky.", "天空中有许多星星。"], ["I see a bright star.", "我看见一颗明亮的星星。"], ["The star is next to the moon.", "星星在月亮旁边。"]],
  student: [["He is a good student.", "他是一个好学生。"], ["The students are in the classroom.", "学生们在教室里。"], ["She is a new student here.", "她是这里的新学生。"]],
  sun: [["The sun is hot in summer.", "夏天太阳很热。"], ["We can see the sun in the day.", "白天我们能看见太阳。"], ["The sun rises in the east.", "太阳从东方升起。"]],
  teacher: [["Our teacher is very kind.", "我们的老师很和蔼。"], ["The teacher helps the students.", "老师帮助学生们。"], ["I like my English teacher.", "我喜欢我的英语老师。"]],
  thank: [["Thank you very much!", "非常感谢你！"], ["He thanked his friend.", "他感谢了他的朋友。"], ["No, thank you.", "不用了，谢谢。"]],
  tree: [["A bird is in the tree.", "树上有一只鸟。"], ["The tree is very tall.", "这棵树很高。"], ["We plant a small tree.", "我们种了一棵小树。"]],
  water: [["I drink water every day.", "我每天喝水。"], ["The fish lives in the water.", "鱼生活在水里。"], ["Please give me a glass of water.", "请给我一杯水。"]],
  write: [["I write a letter to my friend.", "我给朋友写一封信。"], ["She writes her name on the book.", "她把名字写在书上。"], ["Can you write in English?", "你能用英语写吗？"]],
  yellow: [["The sun is yellow.", "太阳是黄色的。"], ["She has a yellow schoolbag.", "她有一个黄色的书包。"], ["I see a yellow flower.", "我看见一朵黄色的花。"]],
};

const raw = JSON.parse(fs.readFileSync(DATA, "utf8"));
const arr = Object.values(raw);
let n = 0;
arr.forEach((w) => {
  if (w.level === "PRIMARY" && PRIMARY[w.word]) {
    w.examples = PRIMARY[w.word].map(([en, cn]) => ({ en, cn }));
    n++;
  }
});
fs.writeFileSync(DATA, JSON.stringify(raw));
console.log("PRIMARY examples written for", n, "words.");

// 统计
let totalEx = 0, missCn = 0, zeroEx = 0;
arr.filter((x) => x.level === "PRIMARY").forEach((x) => {
  const ex = x.examples || []; totalEx += ex.length; if (!ex.length) zeroEx++;
  ex.forEach((e) => { if (!e.cn) missCn++; });
});
console.log(`PRIMARY: avg examples/word ${(totalEx / 41).toFixed(2)} | 0-example ${zeroEx} | missing-cn ${missCn}/${totalEx}`);
