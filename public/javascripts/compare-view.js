var controller = window.parent && window.parent.controller,
	query = controller.getQueryParameters(window),
	diff,
	path = query.path,
	commentHref = 'compare-comment.php?path=' + path + '=',
	commentFrame,
	leftSVG,
	rightSVG,
	leftVersion,
	rightVersion,
	chartWidth,
	chartHeight,
	error,
	mode = query.mode,
	sample = controller.samples[path],
	skipTest = sample.options.details.skipTest,
	isManual = sample.options.details.requiresManualTesting,
	rightcommit = query.rightcommit || false,
	commit = query.commit,
	isUnitTest = sample.isUnitTest(),
	previewSVG;

function showCommentBox() {
	commentHref = commentHref.replace('diff=', 'diff=' + (typeof diff !== 'function' ? diff : '') + '&focus=false');
	if (!commentFrame) {
		commentFrame = $('<iframe>')
			.attr({
				id: 'comment-iframe',
				src: commentHref
			})
			.appendTo('#comment-placeholder');
	}
}

function updateHash() {
	if (window.parent && window.parent.frames[0] && window.parent.history.pushState) {
		var hash = window.parent.frames[0].continueBatch ? '#batch' : '#test';
		hash += '/' + path;
		if (hash !== window.parent.location.hash) {
			window.parent.history.pushState(null, null, hash);
		}
	}

}

function setUpElements() {
	var querystring = window.location.search.replace(/^\?/, '');

	// The body class
	if (isUnitTest) {
		document.body.className = 'single-col unit';
	} else if (isManual) {
		document.body.className = 'single-col manual';
	} else {
		document.body.className = 'visual';
	}

	// The body elements
	if (skipTest) { 
		onIdentical();
		document.getElementById('skip-test-info').style
			.display = 'block';
	} else {
		if (!isUnitTest && !isManual) {
			var leftIframe = document.createElement('iframe');
			leftIframe.src = "compare-iframe?which=left&" +
				querystring + "&dummy=" + Date.now();
			document.getElementById('frame-row')
				.appendChild(leftIframe);
		}
		var rightIFrame = document.createElement('iframe');
		rightIFrame.src = "compare-iframe?which=right&" +
				querystring + "&dummy=" + Date.now();
		document.getElementById('frame-row')
			.appendChild(rightIFrame);
	}
}


$(function() {

	updateHash();
	setUpElements();

	// the reload button
	$('#reload').click(function() {
		location.reload();
	});

	$('#comment').click(function () {
		location.href = commentHref;
	});

	if (controller) {
		$('#bisect').click(controller.toggleBisect);
	}

	$(window).bind('keydown', parent.keyDown);

	$('#svg').click(function () {
		$(this).css({
			height: 'auto',
			cursor: 'default'
		});
	});

	controller.samples[path].setCurrent();


	if (isManual) {
		showCommentBox();
	}

	if ((isUnitTest || isManual) && rightcommit) {
		report += 'Testing commit <a href="http://github.com/highcharts/highcharts/commit/' + rightcommit + '" target="_blank">' + rightcommit + '</a>';
		$('#report').css({
			color: 'gray',
			display: 'block'
		}).html(report);
	}
});



/**
 * Pad a string to a given length
 * @param {String} s
 * @param {Number} length
 */
function pad(s, length, left) {
	var padding;

	if (s.length > length) {
		s = s.substring(0, length);
	}

	padding = new Array((length || 2) + 1 - s.length).join(' ');

	return left ? padding + s : s + padding;
}


function proceed() {
	updateHash(); // Batch may be stopped
	if (window.parent.frames[0] && sample.index !== -1 && window.parent.frames[0].continueBatch) {
		var contentDoc = window.parent.frames[0].document,
			href,
			next,
			nextIndex = sample.index;

		if (!contentDoc || !contentDoc.getElementById('i' + sample.index)) {
			return;
		}

		while (nextIndex++) {
			next = contentDoc.getElementById('i' + nextIndex);
			if (next) {
				href = next.href;
			} else {
				window.location.href = 'view.php';
				return;
			}

			if (!contentDoc.getElementById('i' + nextIndex) || /batch/.test(contentDoc.getElementById('i' + nextIndex).className)) {
				break;
			}
		}

		href = href.replace("/view.php", "/compare-view.html");


		window.parent.batchRuns++;
		// Clear memory build-up from time to time by reloading the
		// whole thing. Firefox has problems redirecting.
		if (window.parent.batchRuns > 90 &&
				navigator.userAgent.indexOf('WebKit') !== -1) {
			window.parent.location.href = '/samples/#batch/' +
				window.parent.frames[0].samples[nextIndex];
		} else {
			window.location.href = href;
		}

	// Else, log the result. This is picked up when running in PhantomJS (phantomtest.js script).
	} else {
		if (typeof diff === 'function') { // leaks from jsDiff
			diff = 0;
		}
		console.log([
			'@proceed',
			pad(path, 60, false),
			diff ? pad(String(diff), 5, true) : '    .' // Only a dot when success
		].join(' '));
	}
}

function onIdentical() {
	sample.setDiff(0)
	proceed();
}

function onDifferent(diff) {
	sample.setDiff(diff);
	proceed();
}

function onLoadTest(which, svg) {

	chartWidth = parseInt(svg.match(/width=\"([0-9]+)\"/)[1]);
	chartHeight = parseInt(svg.match(/height=\"([0-9]+)\"/)[1]);

	if (which == 'left') {
		leftSVG = svg;
	} else {
		rightSVG = svg;
	}
	if (leftSVG && rightSVG) {
		onBothLoad();
	}
}

function wash(svg) {
	if (typeof svg === "string") {
		return svg
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/&lt;del&gt;/g, '<del>')
			.replace(/&lt;\/del&gt;/g, '</del>')
			.replace(/&lt;ins&gt;/g, '<ins>')
			.replace(/&lt;\/ins&gt;/g, '</ins>');
	} else {
		return "";
	}
}

function activateOverlayCompare(isCanvas) {

	var isCanvas = isCanvas || false,
		$button = $('button#overlay-compare'),
		$leftImage = isCanvas ? $('#cnvLeft') : $('#left-image'),
		$rightImage = isCanvas ? $('#cnvRight') : $('#right-image'),
		showingRight,
		toggle = function () {

			// Initiate
			if (showingRight === undefined) {

				$('#preview').css({
					height: $('#preview').height()
				});

				$rightImage
					.css({
						left: $rightImage.offset().left,
						position: 'absolute'
					})
					.animate({
						left: 0
					}, {
						complete: function () {
							$leftImage.hide();
						}
					});

				$leftImage.css('position', 'absolute');
				

				$button.html('Showing right. Click to show left');
				showingRight = true;

			// Show left
			} else if (showingRight) {
				$rightImage.hide();
				$leftImage.show();
				$button.html('Showing left. Click to show right');
				showingRight = false;
			} else {
				$rightImage.show();
				$leftImage.hide();
				$button.html('Showing right. Click to show left.');
				showingRight = true;
			}
		};
	$('#preview').css({
		width: 2 * chartWidth + 20
	});

	$button
		.css('display', '')
		.click(toggle);
	$leftImage.click(toggle);
	$rightImage.click(toggle);
}

var report = "",
	startLocalServer = '<pre>$ cd GitHub/highcharts.com/exporting-server/java/highcharts-export/highcharts-export-web\n' +
		'$ mvn jetty:run</pre>';
function onBothLoad() {

	var out,
		identical;

	if (error) {
		report += "<br/>" + error;
		$('#report').html(report)
			.css('background', '#f15c80');
		onDifferent('Error');
		return;
	}

	// remove identifier for each iframe
	if (leftSVG && rightSVG) {
		leftSVG = leftSVG
			.replace(/which=left/g, "")
			.replace(/Created with [a-zA-Z0-9\.@\- ]+/, "Created with ___");

		rightSVG = rightSVG
			.replace(/which=right/g, "")
			.replace(/Created with [a-zA-Z0-9\.@\- ]+/, "Created with ___");
	}

	if (leftSVG === rightSVG) {
		identical = true;
		onIdentical();
	}

	if (mode === 'images') {
		if (/[^a-zA-Z]NaN[^a-zA-Z]/.test(rightSVG)) {
			report += "<div>The generated SVG contains NaN</div>";
			$('#report').html(report)
				.css('background', '#f15c80');
			onDifferent('Error');
			previewSVG = rightSVG
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;\n');

		} else if (identical) {
			report += "<br/>The generated SVG is identical";
			$('#report').html(report)
				.css('background', "#a4edba");

		} else {
			report += "<div>The generated SVG is different, checking exported images...</div>";

			$('#report').html(report)
				.css('background', 'gray');

			/***
				CANVAS BASED COMPARISON
			***/
			function canvasCompare(source1, canvas1, source2, canvas2, width, height) {
				var converted = [],
					diff = 0,
					canvasWidth = chartWidth || 400,
					canvasHeight = chartHeight || 300;

				// converts the svg into canvas
				//		- source: the svg string
				//		- target: the id of the canvas element to render to
				//		- callback: function to call after conversion
				//
				function convert(source, target, callback) {
					var useBlob = navigator.userAgent.indexOf('WebKit') === -1,
						context = document.getElementById(target).getContext('2d'),
						image = new Image(),
						data,
						domurl,
						blob,
						svgurl;

					// Firefox runs Blob. Safari requires the data: URL. Chrome accepts both
					// but seems to be slightly faster with data: URL.
					if (useBlob) {
						domurl = window.URL || window.webkitURL || window;
						blob = new Blob([source], { type: 'image/svg+xml;charset-utf-16'});
						svgurl = domurl.createObjectURL(blob);
					}

					// This is fired after the image has been created
					image.onload = function() {
						context.drawImage(image, 0, 0, canvasWidth, canvasHeight);
						data = context.getImageData(0, 0, canvasWidth, canvasHeight).data;
						if (useBlob) {
							domurl.revokeObjectURL(svgurl);
						}
						callback(data);
					}
					image.onerror = function (e) {
						var side = source === source1 ? 'left' : 'right';
						report += '<div>Failed painting SVG to canvas on ' + side + ' side.</div>';
						$('#report').html(report).css('background', '#f15c80');
						onDifferent('Error');
					}
					image.src = useBlob ?
						svgurl :
						'data:image/svg+xml,' + source;
				};

				// compares 2 canvas images
				function compare(data1, data2) {
					var	i = data1.length,
						diff = 0,
						// Tune the diff so that identical = 0 and max difference is 100. The max
						// diff can be tested by comparing a rectangle of fill rgba(0, 0, 0, 0) against
						// a rectange of fill rgba(255, 255, 255, 1).
						dividend = 4 * 255 * canvasWidth * canvasHeight / 100;
					while (i--) {
						diff += Math.abs(data1[i] - data2[i]); // loops over all reds, greens, blues and alphas
					}
					diff /= dividend;

					if (diff > 0 && diff < 0.005) {
						diff = 0;
					}
					return diff;
				}

				// called after converting svgs to canvases
				function startCompare(data) {
					converted.push(data);
					// only compare if both have been converted
					if (converted.length == 2) {
						var diff = compare(converted[0], converted[1]);

						if (diff === 0) {
							identical = true;
							report += '<div>The exported images are identical</div>';
							onIdentical();
						} else if (diff === undefined) {
							report += '<div>Canvas Comparison Failed</div>';
							onDifferent('Error');
						} else {
							report += '<div>The exported images are different (dissimilarity index: '+ diff.toFixed(2) +')</div>';
							onDifferent(diff);
						}

						// lower section to overlay images to visually compare the differences
						activateOverlayCompare(true);

						$('#report').html(report).css('background', identical ? "#a4edba" : '#f15c80');
					}
				}


				$('#preview canvas')
					.attr({
						width: chartWidth,
						height: chartHeight
					})
					.css({
						width: chartWidth + 'px',
						height: chartHeight + 'px',
						display: ''
					});

				// start converting
				if (/Edge\/|Trident\/|MSIE /.test(navigator.userAgent)) {
					try {
						canvg(canvas1, source1, {
							scaleWidth: canvasWidth,
							scaleHeight: canvasHeight
						});
						startCompare(document.getElementById(canvas1).getContext('2d').getImageData(0, 0, canvasWidth, canvasHeight).data);
						canvg(canvas2, source2, {
							scaleWidth: canvasWidth,
							scaleHeight: canvasHeight
						});
						startCompare(document.getElementById(canvas2).getContext('2d').getImageData(0, 0, canvasWidth, canvasHeight).data);
					} catch (e) {
						onDifferent('Error');
						report += '<div>Error in canvg, try Chrome or Safari.</div>';
						$('#report').html(report).css('background', '#f15c80');
					}

				} else {
					convert(source1, canvas1, startCompare);
					convert(source2, canvas2, startCompare);
				}
			}

			// Browser sniffing for compare capabilities
			canvasCompare(leftSVG, 'cnvLeft', rightSVG, 'cnvRight', 400, 300);

		}
	} else {
		report += '<div>Left version: '+ leftVersion +'; right version: '+
			(rightcommit ? '<a href="http://github.com/highcharts/highcharts/commit/' + rightcommit + '" target="_blank">' +
				rightcommit + '</a>' : rightVersion) +
			'</div>';

		if (identical) {
			report += '<div>The innerHTML is identical</div>';
			if (leftVersion === rightVersion) {
				report += "<div style='color: red; font-weight: bold'>Warning: Left and right versions are identical.</div>";
			}
		} else {
			report += '<div>The innerHTML is different, testing generated SVG...</div>';
		}

		$('#report').html(report)
			.css('background', identical ? "#a4edba" : '#f15c80');

		if (!identical) {
			// switch to image mode
			leftSVG = rightSVG = undefined;
			mode = 'images';
			$("#iframe-left")[0].contentWindow.compareSVG();
			$("#iframe-right")[0].contentWindow.compareSVG();
		}
	}

	// Show the diff
	if (!identical) {
		//out = diffString(wash(leftSVG), wash(rightSVG)).replace(/&gt;/g, '&gt;\n');
		try {
			out = diffString(
				leftSVG.replace(/>/g, '>\n'),
				rightSVG.replace(/>/g, '>\n')
			);
			$("#svg").html('<h4 style="margin:0 auto 1em 0">Generated SVG (click to view)</h4>' + wash(out));
		} catch (e) {
			$("#svg").html(previewSVG || 'Error diffing SVG');
		}
	}

	/*report +=  '<br/>Left length: '+ leftSVG.length + '; right length: '+ rightSVG.length +
		'; Left version: '+ leftVersion +'; right version: '+ rightVersion;*/

}