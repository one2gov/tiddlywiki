//--
//-- Saving
//--

var saveUsingSafari = false;

var startSaveArea = '<div id="' + 'storeArea">'; // Split up into two so that indexOf() of this source doesn't find it
var startSaveAreaRE = /<((div)|(DIV)) ((id)|(ID))=["']?storeArea['"]?>/; // Used for IE6
var endSaveArea = '</d' + 'iv>';
var endSaveAreaCaps = '</D' + 'IV>';

// If there are unsaved changes, force the user to confirm before exitting
function confirmExit()
{
	hadConfirmExit = true;
	if((store && store.isDirty && store.isDirty()) || (story && story.areAnyDirty && story.areAnyDirty()))
		return config.messages.confirmExit;
}

// Give the user a chance to save changes before exitting
function checkUnsavedChanges()
{
	if(store && store.isDirty && store.isDirty() && window.hadConfirmExit === false) {
		if(confirm(config.messages.unsavedChangesWarning))
			saveChanges();
	}
}

function updateLanguageAttribute(s)
{
	if(config.locale) {
		var mRE = /(<html(?:.*?)?)(?: xml:lang\="([a-z]+)")?(?: lang\="([a-z]+)")?>/;
		var m = mRE.exec(s);
		if(m) {
			var t = m[1];
			if(m[2])
				t += ' xml:lang="' + config.locale + '"';
			if(m[3])
				t += ' lang="' + config.locale + '"';
			t += ">";
			s = s.substr(0,m.index) + t + s.substr(m.index+m[0].length);
		}
	}
	return s;
}

function updateMarkupBlock(s,blockName,tiddlerName)
{
	return s.replaceChunk(
			"<!--%0-START-->".format([blockName]),
			"<!--%0-END-->".format([blockName]),
			"\n" + convertUnicodeToFileFormat(store.getRecursiveTiddlerText(tiddlerName,"")) + "\n");
}

function updateOriginal(original,posDiv,localPath)
{
	if(!posDiv)
		posDiv = locateStoreArea(original);
	if(!posDiv) {
		alert(config.messages.invalidFileError.format([localPath]));
		return null;
	}
	var revised = original.substr(0,posDiv[0] + startSaveArea.length) + "\n" +
				convertUnicodeToFileFormat(store.allTiddlersAsHtml()) + "\n" +
				original.substr(posDiv[1]);
	var newSiteTitle = convertUnicodeToFileFormat(getPageTitle()).htmlEncode();
	revised = revised.replaceChunk("<title"+">","</title"+">"," " + newSiteTitle + " ");
	revised = updateLanguageAttribute(revised);
	revised = updateMarkupBlock(revised,"PRE-HEAD","MarkupPreHead");
	revised = updateMarkupBlock(revised,"POST-HEAD","MarkupPostHead");
	revised = updateMarkupBlock(revised,"PRE-BODY","MarkupPreBody");
	revised = updateMarkupBlock(revised,"POST-SCRIPT","MarkupPostBody");
	return revised;
}

function locateStoreArea(original)
{
	// Locate the storeArea divs
	if(!original)
		return null;
	var posOpeningDiv = original.search(startSaveAreaRE);
	var limitClosingDiv = original.indexOf("<"+"!--POST-STOREAREA--"+">");
	if(limitClosingDiv == -1)
		limitClosingDiv = original.indexOf("<"+"!--POST-BODY-START--"+">");
	var start = limitClosingDiv == -1 ? original.length : limitClosingDiv;
	var posClosingDiv = original.lastIndexOf(endSaveArea,start);
	if(posClosingDiv == -1)
		posClosingDiv = original.lastIndexOf(endSaveAreaCaps,start);
	return (posOpeningDiv != -1 && posClosingDiv != -1) ? [posOpeningDiv,posClosingDiv] : null;
}

function autoSaveChanges(onlyIfDirty,tiddlers)
{
	if(config.options.chkAutoSave)
		saveChanges(onlyIfDirty,tiddlers);
}

function loadOriginal(localPath)
{
	var content=loadFile(localPath);
	if (!content) content=window.originalHTML||recreateOriginal();
	return content;
}

//# reconstruct original HTML file content from current document memory
function recreateOriginal()
{
	// construct doctype
	var content = "<!DOCTYPE ";
	var t=document.doctype;
	if (!t) 
		content+="html"
	else {
		content+=t.name;
		if      (t.publicId)		content+=' PUBLIC "'+t.publicId+'"';
		else if (t.systemId)		content+=' SYSTEM "'+t.systemId+'"';
	}
	content+=' "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd"';
	content+='>\n';

	// append current document content
	content+=document.documentElement.outerHTML;

	//# clear 'savetest' marker
	content=content.replace(/<div id="saveTest">savetest<\/div>/,'<div id="saveTest"></div>');
	//# clear <applet> following </script>
	content=content.replace(/script><applet [^\>]*><\/applet>/g,'script>');
	//# newline before head tag
	content=content.replace(/><head>/,'>\n<head>');
	//# newlines before/after end of body/html tags
	content=content.replace(/\n\n<\/body><\/html>$/,'</body>\n</html>\n');
	//# meta tag terminators
	content=content.replace(/(<(meta) [^\>]*[^\/])>/g,'$1 />');
	//# decode LT/GT entities in noscript
	content=content.replace(/<noscript>[^\<]*<\/noscript>/,
		function(m){return m.replace(/&lt;/g,'<').replace(/&gt;/g,'>');});
	//# encode copyright symbols (UTF-8 to HTML entity)
	content=content.replace(/<div id="copyright">[^\<]*<\/div>/,
		function(m){return m.replace(/\xA9/g,'&copy;');});

	return content;
}

// Save this tiddlywiki with the pending changes
function saveChanges(onlyIfDirty,tiddlers)
{
	if(onlyIfDirty && !store.isDirty())
		return;
	clearMessage();
	var t0 = new Date();
	var msg = config.messages;
	//# Get the URL of the document
	var originalPath = document.location.toString();
	//# Check we can save this file
	if(!window.allowSave()) {
		alert(msg.notFileUrlError);
		if(store.tiddlerExists(msg.saveInstructions))
			story.displayTiddler(null,msg.saveInstructions);
		return;
	}
	var localPath = getLocalPath(originalPath);
	//# Load the original file
	var original = loadOriginal(localPath);
	if(original == null) {
		alert(msg.cantSaveError);
		if(store.tiddlerExists(msg.saveInstructions))
			story.displayTiddler(null,msg.saveInstructions);
		return;
	}
	//# Locate the storeArea div's
	var posDiv = locateStoreArea(original);
	if(!posDiv) {
		alert(msg.invalidFileError.format([localPath]));
		return;
	}
	var co=config.options; //# abbreviation
	config.saveByDownload=false;
	config.saveByManualDownload=false;
	saveMain(localPath,original,posDiv);
	if (!config.saveByDownload && !config.saveByManualDownload) {
		if(co.chkSaveBackups)
			saveBackup(localPath,original);
		if(co.chkSaveEmptyTemplate)
			saveEmpty(localPath,original,posDiv);
		if(co.chkGenerateAnRssFeed && saveRss instanceof Function)
			saveRss(localPath);
	}
	if(co.chkDisplayInstrumentation)
		displayMessage("saveChanges " + (new Date()-t0) + " ms");
}


function saveMain(localPath,original,posDiv)
{
	var save;
	try {
		//# Save new file
		var revised = updateOriginal(original,posDiv,localPath);
		save = saveFile(localPath,revised);
	} catch (ex) {
		showException(ex);
	}
	if(save) {
		if (!config.saveByManualDownload) {
			if (config.saveByDownload) { //# set by HTML5DownloadSaveFile()
				var link = getDataURI(revised);
				var msg  = config.messages.mainDownload;
			} else {
				var link = "file://" + localPath;
				var msg  = config.messages.mainSaved;
			}
			displayMessage(msg,link);
		}
		store.setDirty(false);
	} else {
		alert(config.messages.mainFailed);
	}
}

function saveBackup(localPath,original)
{
	//# Save the backup
	var backupPath = getBackupPath(localPath);
	var backup = copyFile(backupPath,localPath);
	//# Browser does not support copy, so use save instead
	if(!backup)
		backup = saveFile(backupPath,original);
	if(backup)
		displayMessage(config.messages.backupSaved,"file://" + backupPath);
	else
		alert(config.messages.backupFailed);
}

function saveEmpty(localPath,original,posDiv)
{
	//# Save empty template
	var emptyPath,p;
	if((p = localPath.lastIndexOf("/")) != -1)
		emptyPath = localPath.substr(0,p) + "/";
	else if((p = localPath.lastIndexOf("\\")) != -1)
		emptyPath = localPath.substr(0,p) + "\\";
	else
		emptyPath = localPath + ".";
	emptyPath += "empty.html";
	var empty = original.substr(0,posDiv[0] + startSaveArea.length) + original.substr(posDiv[1]);
	var emptySave = saveFile(emptyPath,empty);
	if(emptySave)
		displayMessage(config.messages.emptySaved,"file://" + emptyPath);
	else
		alert(config.messages.emptyFailed);
}

// Translate URL to local path [Preemption]
window.getLocalPath = window.getLocalPath || function(origPath)
{
	var originalPath = convertUriToUTF8(origPath,config.options.txtFileSystemCharSet);
	// Remove any location or query part of the URL
	var argPos = originalPath.indexOf("?");
	if(argPos != -1)
		originalPath = originalPath.substr(0,argPos);
	var hashPos = originalPath.indexOf("#");
	if(hashPos != -1)
		originalPath = originalPath.substr(0,hashPos);
	// Convert file://localhost/ to file:///
	if(originalPath.indexOf("file://localhost/") == 0)
		originalPath = "file://" + originalPath.substr(16);
	// Convert to a native file format
	//# "file:///x:/path/path/path..." - pc local file --> "x:\path\path\path..."
	//# "file://///server/share/path/path/path..." - FireFox pc network file --> "\\server\share\path\path\path..."
	//# "file:///path/path/path..." - mac/unix local file --> "/path/path/path..."
	//# "file://server/share/path/path/path..." - pc network file --> "\\server\share\path\path\path..."
	var localPath;
	if(originalPath.charAt(9) == ":") // pc local file
		localPath = unescape(originalPath.substr(8)).replace(new RegExp("/","g"),"\\");
	else if(originalPath.indexOf("file://///") == 0) // FireFox pc network file
		localPath = "\\\\" + unescape(originalPath.substr(10)).replace(new RegExp("/","g"),"\\");
	else if(originalPath.indexOf("file:///") == 0) // mac/unix local file
		localPath = unescape(originalPath.substr(7));
	else if(originalPath.indexOf("file:/") == 0) // mac/unix local file
		localPath = unescape(originalPath.substr(5));
	else // pc network file
		localPath = "\\\\" + unescape(originalPath.substr(7)).replace(new RegExp("/","g"),"\\");
	return localPath;
}

function getBackupPath(localPath,title,extension)
{
	var slash = "\\";
	var dirPathPos = localPath.lastIndexOf("\\");
	if(dirPathPos == -1) {
		dirPathPos = localPath.lastIndexOf("/");
		slash = "/";
	}
	var backupFolder = config.options.txtBackupFolder;
	if(!backupFolder || backupFolder == "")
		backupFolder = ".";
	var backupPath = localPath.substr(0,dirPathPos) + slash + backupFolder + localPath.substr(dirPathPos);
	backupPath = backupPath.substr(0,backupPath.lastIndexOf(".")) + ".";
	//# replace illegal filename characters(// \/:*?"<>|) and space with underscore
	if(title)
		backupPath += title.replace(/[\\\/\*\?\":<> ]/g,"_") + ".";
	backupPath += (new Date()).convertToYYYYMMDDHHMMSSMMM() + "." + (extension || "html");
	return backupPath;
}

