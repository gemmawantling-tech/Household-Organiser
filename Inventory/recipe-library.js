/* Pantry adaptations researched from the linked recipes; amounts are app planning
   assumptions per adult serving, not the publishers' recipe quantities. */
(function(root){
const sources={
 pasta:'https://www.bbcgoodfood.com/recipes/storecupboard-pasta-salad',
 beans:'https://www.bbcgoodfood.com/recipes/tomato-pepper-bean-one-pot',
 lentils:'https://www.bbcgoodfood.com/recipes/red-lentil-chickpea-chilli-soup',
 noodles:'https://www.bbcgoodfood.com/recipes/satay-noodle-soup',
 wraps:'https://www.bbcgoodfoodme.com/recipes/refried-bean-quesadillas/',
 soup:'https://www.bbcgoodfoodme.com/recipes/spicy-chilli-bean-soup/'
};
const recipe=(key,name,kinds,grams,method,source,note='Keep seasoning separate for children.')=>({key,name,kinds,grams,method,source:sources[source]||'',note});
root.ReservesRecipeLibrary=[
 recipe('pasta-sauce','Pasta with tomato sauce',['pasta','sauce'],{},'Cook pasta according to its packet. Warm the tomato sauce separately; serve over the pasta or at the side.'),
 recipe('rice-beans','Rice and beans',['rice','beans'],{beans:125},'Cook or heat the rice and prepare the beans following the tin, pouch or sachet labels. Serve together or separately.'),
 recipe('lentil-rice','Lentils with rice',['rice','lentils'],{},'Cook lentils fully following their packet; heat or cook the rice separately, then serve together.'),
 recipe('porridge','Porridge',['oats','milk'],{},'Cook oats with the milk following the oat packet. Cool before serving to children.'),
 recipe('soup-crisps','Soup with tortilla crisps',['soup','crisps'],{},'Heat the soup according to its label. Serve crisps alongside or add just before eating.'),
 recipe('soup','Soup',['soup'],{},'Heat the soup following the tin or packet directions. Cool children’s servings.'),
 recipe('noodles','Noodles',['noodles'],{},'Prepare according to the packet; leave seasoning sachets at the side for children.'),
 recipe('ready','Ready-to-eat meal',['ready'],{},'Prepare following the product label. Check portion size and suitability for children.'),
 recipe('tuna-corn-pasta','Tuna and sweetcorn pasta',['pasta','tuna','corn'],{tuna:80,corn:60},'Cook pasta, prepare sweetcorn as labelled, and drain the tuna. Serve together or in separate piles. No dressing is assumed.','pasta'),
 recipe('tuna-tomato-pasta','Tuna and tomato pasta',['pasta','tuna','sauce'],{tuna:80},'Cook pasta. Heat tomato sauce, stir in drained tuna and warm through, then serve.','pasta'),
 recipe('pesto-pasta','Pesto pasta',['pasta','pesto'],{pesto:25},'Cook pasta, reserve a little cooking water, then toss with pesto. Keep pesto at the side if preferred.','pasta'),
 recipe('tuna-pesto-pasta','Tuna pesto pasta',['pasta','tuna','pesto'],{tuna:80,pesto:25},'Cook pasta and drain tuna. Toss with pesto, or serve the three ingredients separately.','pasta'),
 recipe('bean-tomato-rice','Tomato bean rice bowl',['rice','beans','sauce'],{beans:125,sauce:100},'Cook or heat rice. Prepare beans according to their label, heat in tomato sauce and serve with rice.','beans'),
 recipe('pepper-bean-pot','Tomato, pepper and bean pot',['beans','sauce','pepper'],{beans:200,sauce:150,pepper:75},'Prepare beans as labelled. Simmer with tomato sauce and chopped peppers until fully cooked and tender.','beans'),
 recipe('bean-tomato-toast','Tomato beans on toast',['beans','sauce','bread'],{beans:150,sauce:100,bread:80},'Prepare beans as labelled and warm with tomato sauce. Toast bread and spoon the beans over it or serve separately.','beans'),
 recipe('beans-toast','Beans on toast',['beans','bread'],{beans:200,bread:80},'Prepare the beans following their label. Toast the bread and serve beans over or alongside it.','beans'),
 recipe('lentil-tomato-soup','Lentil and tomato soup',['lentils','sauce'],{sauce:150},'Cook lentils fully as labelled. Add tomato sauce and water to your preferred soup consistency, simmer and mash if desired.','lentils'),
 recipe('lentil-bean-soup','Lentil and bean tomato soup',['lentils','beans','sauce'],{beans:100,sauce:150},'Cook lentils fully as labelled, then add prepared beans, tomato sauce and water. Simmer until hot and tender.','lentils'),
 recipe('peanut-noodles','Peanut butter noodles',['noodles','peanut'],{peanut:25},'Cook noodles. Loosen peanut butter with a little hot cooking water, then toss or serve as a separate sauce.','noodles','Contains peanuts: use only if suitable for everyone eating.'),
 recipe('peanut-soy-noodles','Peanut and soy noodles',['noodles','peanut','soy'],{peanut:25,soy:10},'Cook noodles. Mix peanut butter with soy sauce and a little hot cooking water; add to noodles or offer separately.','noodles','Contains peanuts and soy: check allergies and labels.'),
 recipe('pea-peanut-noodles','Pea and peanut noodles',['noodles','peanut','peas'],{peanut:25,peas:80},'Cook noodles and peas according to their labels. Mix peanut butter with hot cooking water; serve with noodles and peas.','noodles','Contains peanuts: use only if suitable for everyone eating.'),
 recipe('bean-cheese-wrap','Bean and cheese quesadilla',['beans','cheese','wrap'],{beans:125,cheese:30,wrap:60},'Prepare and mash beans. Spread on a wrap with cheese, fold and heat in a dry non-stick pan until hot and the cheese melts.','wraps'),
 recipe('cheese-wrap','Simple cheese tortilla',['cheese','wrap'],{cheese:40,wrap:60},'Put cheese on one half of a wrap, fold, then heat in a dry non-stick pan until melted. Cool and cut into manageable pieces.','wraps'),
 recipe('bean-corn-nachos','Bean and sweetcorn tortilla bowl',['beans','corn','crisps'],{beans:150,corn:60,crisps:40},'Prepare beans and sweetcorn as labelled. Serve hot alongside tortilla crisps; add crisps at the last moment to keep them crunchy.','soup'),
 recipe('tomato-bean-soup','Tomato bean soup with crisps',['beans','sauce','crisps'],{beans:150,sauce:150,crisps:30},'Prepare beans, heat with tomato sauce and enough water for a soup, then serve with tortilla crisps.','soup'),
 recipe('rice-tuna-corn','Tuna and sweetcorn rice bowl',['rice','tuna','corn'],{tuna:80,corn:60},'Heat or cook rice and prepare sweetcorn following their labels. Drain tuna and serve with the rice and corn, keeping ingredients separate if preferred.','pasta'),
 recipe('soup-bread','Soup and toast',['soup','bread'],{bread:80},'Heat soup as labelled. Toast bread and serve alongside for dipping.'),
 recipe('peanut-toast','Peanut butter toast',['bread','peanut'],{bread:80,peanut:25},'Toast the bread and spread with a thin layer of peanut butter.','noodles','Contains peanuts: use only if suitable; this is a simple breakfast or light meal.')
];
})(globalThis);
