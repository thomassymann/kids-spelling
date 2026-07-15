"use strict";

// Word sources:
//  - Kindergarten: Dolch pre-primer + primer sight words (sightwords.com/sight-words/dolch)
//  - Grade 1: CVC word families (spelling-words-well.com) + Dolch first grade
//  - Grade 2: spelling-words-well.com second grade list (175 words)
//  - Grade 3: spelling-words-well.com third grade list (contractions/weekdays removed)
//  - Grade 4: spelling-words-well.com fourth grade list (300 words, multi-word entries removed)
// All entries are lowercase a-z only so they fit the on-screen keyboard.

// Audio for all words is pre-generated into audio/words/ (word .wav +
// sentence .mp3) via tools/generate-audio.mjs (OpenRouter, hexgrad/kokoro-82m).
// Example sentences live in sentences.js.
const WORDS = {
  test: ["cat", "jump", "blue", "fish", "tree"],
  k: [
    "and","away","big","blue","can","come","down","find","for","funny","help",
    "here","jump","little","look","make","not","one","play",
    "red","run","said","see","the","three","two","where","yellow","you",
    "all","are","ate","black","brown","but","came","did","eat",
    "four","get","good","have","into","like","must","new","now","our",
    "out","please","pretty","ran","ride","saw","say","she","soon","that","there",
    "they","this","too","under","want","was","well","went","what","white","who","will",
    "with","yes"
  ],
  g1: [
    "bat","cat","sat","that","can","ran","man","plan","dad","had","sad","bad",
    "bag","rag","tag","brag","cap","map","tap","slap","and","land","sand","band","hand",
    "bed","red","fed","sled","hen","men","pen","when","pet","jet","get","let","bell",
    "tell","yell","smell","best","nest","rest","test","did","hid","lid","kid","big",
    "dig","pig","wig","bill","fill","hill","spill","pin","win","thin","spin","dip",
    "lip","zip","tip","bit","fit","hit","sit","job","mob","rob","sob","hog","fog","log",
    "frog","pop","hop","top","stop","hot","lot","not","spot","cub","rub","tub","club",
    "bug","dug","hug","rug","fun","bun","run","sun","but","cut","nut","rut",
    "after","again","any","ask","could","every","fly","from","give","going","has",
    "her","him","his","how","just","know","live","may","old","once","open","over",
    "put","round","some","take","thank","them","then","think","walk","were"
  ],
  g2: [
    "after","again","air","also","always","animal","another","any","around","ask",
    "away","back","barn","bath","because","been","before","best","better","between",
    "blend","boat","both","bright","brother","buy","call","cannot","child","clean",
    "clock","cold","could","count","deep","deer","dish","does","dress","drip","drive",
    "drop","drum","each","eight","eleven","end","even","every","family","fast","fed",
    "feed","fight","first","found","friend","gave","give","goat","goes","good","great",
    "grin","happy","help","here","high","him","home","house","its","jump","just",
    "kind","kiss","large","light","line","lion","list","little","lock","long","look",
    "loud","lunch","made","mess","might","most","much","must","new","night","nine",
    "now","off","only","our","out","path","place","plus","pool","put","rabbit","read",
    "rest","right","rock","said","says","sea","second","seem","send","seven","shape",
    "sight","silly","sing","sister","slid","slip","snack","song","soon","sound",
    "speed","stamp","state","still","stone","such","summer","take","tell","their",
    "them","there","these","thing","think","ton","too","tray","treat","trick","tune",
    "twelve","under","upon","use","very","wash","well","went","where","which","who",
    "why","winter","wish","work","would","write","yard","year","yet","your"
  ],
  g3: [
    "about","across","afraid","afternoon","age","ago","almost","also","anyone",
    "anything","balloon","basket","bean","bear","behind","birthday","blind","body",
    "born","boxes","bread","breakfast","brush","build","buses","butter","carries",
    "caught","change","cheese","cherry","circus","classes","clear","climb","clown",
    "color","coming","crawl","crazy","cries","dinner","doctor","dollar","done",
    "driving","early","easy","everyone","everything","eyes","finish","flies","foil",
    "food","forgot","front","funny","gift","grinned","guess","half","happen","heard",
    "heart","heavy","hello","himself","horse","hurt","kept","key","knee","knew",
    "know","lamb","laugh","law","leave","left","life","lift","lived","lose","love",
    "mark","match","maybe","meal","meat","meet","merry","more","morning","mouse",
    "mouth","move","near","never","newspaper","noise","none","once","other","outside",
    "own","paint","park","past","penny","picnic","piece","point","prize","push",
    "queen","quickly","raised","really","riding","river","rode","roll","roses","rule",
    "running","sail","sale","school","scratch","scream","serve","sew","shelf","shiny",
    "shopping","should","sitting","skinned","sky","slept","smiling","soft","someone",
    "something","speak","spread","spring","stairs","stopped","straight","street",
    "stretch","string","strong","suit","summer","tenth","thick","threw","throw",
    "tiny","today","together","tooth","touch","town","tries","trouble","true","turn",
    "until","used","voice","walk","warm","whole","window","without","wore","wrong",
    "wrote","young"
  ],
  g4: [
    "against","agree","airport","alarm","alive","alley","alphabet","although",
    "always","angriest","angry","animal","answer","asleep","attack","aunt","banana",
    "battle","beautiful","beauty","become","beggar","believe","belong","between",
    "blanket","blood","bottle","bought","bounce","breath","bridge","broke","broken",
    "brought","bubble","building","built","busy","button","buying","calf","camera",
    "cardboard","caring","carrying","catch","center","certain","chance","charge",
    "cheer","chicken","chief","choice","choose","chore","chose","circle","cities",
    "clothing","coast","coin","comb","common","copying","corner","cottage","cotton",
    "couch","cough","couple","cousin","cover","crayon","crime","crooked","crow",
    "crowd","crumb","curl","dairy","damage","danger","dawn","deaf","dear","death",
    "decide","degree","deliver","dirty","disappear","dislike","divide","double",
    "downstairs","drain","drawer","earlier","earn","earth","easier","eighty",
    "either","electric","engine","enough","evening","except","faint","false",
    "famous","fear","feather","felt","fever","few","fifth","fifty","final","follow",
    "forever","forgive","forty","fourth","fright","fruit","gain","garden","gasoline",
    "gear","gentle","giant","glance","gold","grandfather","grandmother","groceries",
    "grown","guard","handsome","happiest","health","heard","hiking","holidays",
    "honey","honor","hospital","hour","however","howl","hundred","hungry","hurry",
    "husband","important","interest","invite","jacket","jaw","judge","juice",
    "kindness","kitchen","kneel","knight","libraries","library","listen","lonely",
    "loyal","machine","mailbox","meant","medal","middle","mirror","mistake","moment",
    "monkey","movement","neighbor","neither","nickel","ninety","ninth","nobody",
    "obeyed","odd","office","often","paper","parent","paste","path","peaceful",
    "pencil","perfect","picture","planet","playground","pleasing","police",
    "powerful","proper","public","question","quiet","quilt","quit","quite",
    "railroad","reach","ready","reason","remember","return","ridge","roast","roof",
    "rough","round","ruler","safe","sauce","scrap","search","season","self",
    "seventh","seventy","sharp","shout","sidewalk","sigh","sign","simple","since",
    "sink","sixth","sixty","sleeve","smooth","sneeze","soften","spare","special",
    "squirrel","steal","steel","strange","studied","studying","style","suppose",
    "tennis","thirty","thumb","tool","towel","tube","tuna","twenty","twice","uncle",
    "understand","useful","useless","village","visit","wait","weather","weight",
    "whenever","whether","women","wonder","wood","world","worried","wrist","worse",
    "written","yourself","zebra","zero","zipper","zoo"
  ]
};
