var numeric = require('numeric');
var NodeCache = require( "node-cache" ); 
var myCache = new NodeCache();
var fs = require('fs');
var async = require("async");
var printP = [];
var data = JSON.parse(fs.readFileSync('./test.json'));
var prompt = require('prompt');
 prompt.start();
var		input_size = data.input_size,
		mem_size   = data.mem_size,
		mem_width  = data.mem_width,
		output_size = data.output_size,
		shift_width = data.shift_width,
		layer_sizes= data.layer_sizes,
		no_heads= data.no_heads;

module.exports = {
	myCache:myCache
};

var controller =require("./controller");
var head  = require("./head");
function tanh(x) {
  if(x === Infinity) {
    return 1;
  } else if(x === -Infinity) {
    return -1;
  } else {
    var y = Math.exp(2 * x);
    return (y - 1) / (y + 1);
  }
}
function build_step(P,controller,controller_size,mem_size,mem_width,cosine_sim,asdshift_width,no_heads){
    var memory_init = [[]];
    var weight_init = [];
    
    for(var i =0; i <mem_size; i++){
        var tmp = [];
        
        for(var j = 0; j <mem_width; j++){
            tmp.push(2*Math.random()-0.5);
        }
        memory_init.push(tmp);
    }
    
    for (var i =0; i < mem_size; i++){
        weight_init.push(tanh(Math.random()));
    }
    //time to build the heads to connect to memory matrix
   head.build(controller_size,mem_width,mem_size,shift_width);
   
   return [memory_init,weight_init];
    
}
function build_memory_curr(M_prev,erase_head,add_head,weight){
    
	var M_curr=[];
	var ones = [];
	for(var i=0; i <erase_head.length; i++){
		ones.push(1);
	}
	for(var i = 0; i < M_prev.length; i++){
		M_curr.push(numeric.mul(M_prev[i], numeric.sub(ones,numeric.mul(erase_head,weight))));
	}

	return M_curr;

}
function build_read(M_curr,weight_curr){
	console.log("READING FROM MATRIX");
	var tmp =[];

	for(var i = 0; i <mem_width;i++){
		var sum= 0;
		for(var j= 0; j<mem_size; j++){
			//some values of M_curr are undefinedw
			if(M_curr[i][j]){
				sum+=weight_curr[i]*M_curr[i][j];
			}		
			
		}
		tmp.push(sum);
	}
	return tmp;
}
function shift_convolve(weight,shift){

	var tmp = [];
	for(var i = 0; i < weight.length; i++){
		var res= 0;
		for(var j =0; j < weight.length; j++){
			var moduloIndex= Math.abs((i-j)%weight.length);
			if(moduloIndex < shift.length){
			res+=weight[j]*shift[moduloIndex];
			}
			else{
				res+=0;
			}
			
		}
		tmp.push(res);
	}

	return tmp;
}

function build_head_curr(weight_prev,M_curr,head,input_curr){
	//Now we got a problem here
	//This is from figure 2
	var resultArray = 	head.head_params(input_curr);
	console.log(input_curr);
	setTimeout(function(){process.exit(); }, 3000);
	var key = resultArray[0];
	var beta = resultArray[1];
	var g =resultArray[2];
	var shift = resultArray[3];
	var gamma = resultArray[4];
	var erase = resultArray[5];
	var add = resultArray[6];
	printP = resultArray;

	var totalSum = 0;
	var weight_c = [];
	for(var i =0; i < M_curr.length; i ++){
		var tmp = cosine_sim(key,M_curr[i]);
		totalSum += Math.exp(beta*tmp);
	}
	
	for(var i =0; i < M_curr.length; i ++){

		weight_c.push(Math.exp(beta*cosine_sim(key,M_curr[i],M_curr[i]))/totalSum);
	}
	
	var tmpWCT = [];
	for(var i =0; i<weight_c.length; i++){
		tmpWCT.push(g*weight_c[i]);
	}
	
	var tmpwTM1 = [];
	for(var i =0; i<weight_prev.length; i++){
		tmpwTM1.push((1-g)*weight_prev[i]);
	}
	var weight_g = numeric.add(tmpwTM1,tmpWCT);
	
	//shifted weights are not showing up correctly  
	var weight_shifted = shift_convolve(weight_g,shift);

	var totalSum1 = 0;
	var weight_sharp =[];
	for(var i =0; i < weight_shifted.length; i ++){
		totalSum1 += Math.pow(weight_shifted[i],gamma);
	}
	for(var i =0; i < weight_shifted.length; i ++){
		weight_sharp.push( Math.pow(weight_shifted[i],gamma)/totalSum1);
	}
	var weight_curr=weight_sharp;
	
	return [weight_curr,erase,add];


}

function step(input_curr,M_prev,weight_prev,callback){
	//problem occuring in step
	
	var read_prev =build_read(M_prev,weight_prev);
	//read_prev looks good something in between here
	controller.controllerFunction(input_curr,read_prev,function(resultArray2){

			var output = resultArray2[0];
	var controller_hidden =resultArray2[1];
	myCache.set( "controller_hidden", controller_hidden, function( err, success ){
   if( !err && success ){
   

	var weight_inter = weight_prev;
	var M_inter = M_prev;
	
	
	
	var resultArray3	= build_head_curr(weight_inter,M_inter,
	head,controller_hidden)
	weight_inter =resultArray3[0];
	var erase = resultArray3[1];
	var add = resultArray3[2]; 
	
	M_inter = build_memory_curr(M_inter,erase,add,weight_inter);
	var weight_curr = weight_inter;
	var M_curr = M_inter;
	
	callback([M_curr,weight_curr,output]);
   }
   
		});
	});
	//why is this always returning .5

	
	
	
	
	
}

//THIS IS THE EQUIVALENT OF THE THEANO SCAN FUNCTIOn 
function predict(P,mem_size,mem_width,controller_size,ctrl,input_seq,firstTime,memory_init,weight_init,callback){
	if(firstTime){
	var resultArray4=  build_step(P,ctrl,controller_size,mem_size,mem_width);
	memory_init = resultArray4[0];
 	memory_init.shift();
	weight_init = resultArray4[1];
	}
	var outputArray= [];
	//this would turn into a for loop that loops over a set of input 
	//sequences
	//THIS IS THE MAIN INPUT
		var resultArray5 = step(input_seq,memory_init,weight_init,function(resultArray5) {
			
	
		memory_init = resultArray5[0];
		weight_init = resultArray5[1];
		outputArray.push(resultArray5[2]);
			callback([outputArray,memory_init,weight_init]);
		
			
		});
}

function cosine_sim(k,M){
	
	var numerator = numeric.dotVM(k,M);
	var denominator = (k.length + M.length);
	return (numerator/denominator);
}

function shift_conv (s_t,wG_t,memMat){
	console.log(s_t);
	process.exit();
	var tmp = [];
	for(var i = 0; i < wG_t.length; i++){
		var res= 0;
		for(var j =0; j < memMat[0].length; j++){
			if(s_t[i-j]){
			res+=wG_t[j]*s_t[i-j]
			}
		}
		tmp.push(res);
	}

	return tmp;
}


//here is the maine

var P={};
//var inputSequence = data.inputSequence;
var inputSequenceArray = data.inputSequence;
var targetSequenceArray = data.targetSequence;
var inputSequence = null;
var targetSequence = null;
var firstTime = true;
var learningRate = .3;

var backPropIter = true;

var inputSequenceArrayLength = inputSequenceArray.length;
var sumLength = 0;
async.each(inputSequenceArray,
  // 2nd param is the function that each item is passed to
  function(item, callback){
  	firstTime = true;
  	inputSequence = item;
  	targetSequence = targetSequenceArray[sumLength];

    // Call an asynchronous function, often a save() to DB
   
    	predict(P,mem_size,mem_width,layer_sizes,controller,inputSequence,firstTime,[[]],[],function(finalResult){
	//console.log("Final --->",finalResult[0][0]);
			sumLength+=1;
				//console.log("Training on: ");
				//console.log(inputSequence);
			
			backPropogation(finalResult);
   			//console.log("-------");
			//console.log('Neural Network Trained Ready for Input sequence: \n');
			if(sumLength ===inputSequenceArrayLength){
				prompt.get(['inputsequence'], function (err, result) {
   	
    				//console.log("\n");
    				//console.log('  inputsequence: ' + result.inputsequence);
					//console.log("\n");
						var tmpSeq = [];
					if(data.testSequence.length>1){
						tmpSeq = data.testSequence;
					}
	    			else{
	    			
	    				var tmpSeq = result.inputsequence.split(',').map(function(item) {
	    						return parseInt(item, 10);
						});
    				}
    				predict(P,mem_size,mem_width,layer_sizes,controller,tmpSeq,false,finalResult[1],finalResult[2],function(tmpfinalResult1){
    					console.log("Input Sequence --->");
 						console.log(tmpSeq);
 						console.log("Final --->");
 						console.log(tmpfinalResult1[0][0]);
 						console.log("memMat --->");
 						console.log(tmpfinalResult1[1]);
 						console.log("weightings --- >");
 						console.log(tmpfinalResult1[2]);
 						console.log("Key --->")
 						console.log(printP[0]);
 						console.log("beta --->")
 						console.log(printP[1]);
 						console.log("g --->")
 						console.log(printP[2]);
 						console.log("shift --->")
 						console.log(printP[3]);
 						console.log("gamma --->")
 						console.log(printP[4]);
 						console.log("erase --->")
 						console.log(printP[5]);
 						console.log("add --->")
 						console.log(printP[6]);

 						fs.writeFile('result.txt',tmpfinalResult1[0][0],function(err){
 							
 						});	
 						
    	});
 	 

 	 });




			}
		});
	
  },
  // 3rd param is the function to call when everything's done
  function(err){
    // All tasks are done now
    console.log("FINISHED");
  }
);








function backPropogation(finalResultVector){
	
	myCache.get( "W_input_hidden", function( err, W_input_hidden ){
    myCache.get( "W_read_hidden", function( err, W_read_hidden ){
    myCache.get( "b_hidden_0", function( err, b_hidden_0 ){
    myCache.get( "W_hidden_output", function( err, W_hidden_output ){   
    myCache.get("b_output", function( err, b_output){
    myCache.get("controller_hidden", function( err, controller_hidden){
    myCache.get("hidden_weights",function(err, hidden_weights){
    	var finalResult = finalResultVector[0][0];
    	var errorVector = [];
			for (var i =0 ; i < finalResult.length; i++){
			errorVector.push( finalResult[i] *(1-finalResult[i])*(targetSequence[i]-finalResult[i])  );
		}
    	for(var i =0; i < W_hidden_output.W_hidden_output.length; i++){
    		for (var j=0; j< W_hidden_output.W_hidden_output[i].length; j++){
    			//when i=0 first node hidden to first node of output weight 
    			W_hidden_output.W_hidden_output[i][j] += learningRate * errorVector[j]*controller_hidden.controller_hidden[i];
    		}
    		
    	}

    	//calculate hidden layer errors
    	var errorVectorHidden =[];
    	for (var i =0; i < W_hidden_output.W_hidden_output.length; i ++ ){
    		var sum1 = 0;
    		for(var k=0; k< W_hidden_output.W_hidden_output[i].length;k++){
    			sum1+=controller_hidden.controller_hidden[i]* (1 - controller_hidden.controller_hidden[i])*(errorVector[k]*W_hidden_output.W_hidden_output[i][k]) ;
    		}
    		errorVectorHidden.push(sum1);
    	}
       	
       for(var i =0; i < W_input_hidden.W_input_hidden.length; i++){
    		for (var j=0; j< W_input_hidden.W_input_hidden[i].length; j++){
    			//when i=0 first node hidden to first node of output weight 
    			W_input_hidden.W_input_hidden[i][j] += learningRate* errorVectorHidden[j]*targetSequence[i];
    		}
    		
    	}

    	//do another foward pass
    	firstTime = false;
    
       predict(P,mem_size,mem_width,layer_sizes,controller,inputSequence,firstTime,finalResultVector[1],finalResultVector[2],function(finalResult){
				

					
					//console.log("-------\n");
					//console.log("Final --->",finalResult[0][0]);
					if (absoluteError(finalResult[0][0], inputSequence)){
						
						backPropIter =false;

					}
					else{
						backPropogation(finalResult);
					}
				
				
			
	
	
		});
  
     	
     	
    }); 	
    }); 	
    });
    }); 
    });        
    });
    });
	
}

function absoluteError(finalResult, inputSequence){
	var sum = 0;

	for(var i =0 ; i < finalResult.length; i++){
		if(Math.abs(finalResult[i] - inputSequence[i]) <10) {
			sum+=1;
		}
	}

	if(sum === inputSequence.length) {
		return true;
	}

	else {
		return false;
	}
}
